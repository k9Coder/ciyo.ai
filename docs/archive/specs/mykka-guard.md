# mykka-guard — Product Specification
**Version:** 0.1 (pre-implementation)  
**Date:** 2026-06-12  
**Authors:** Marcus Webb (CTO), Yuki Tanaka, Ben Cho (PM)  
**Status:** Approved for implementation planning

---

## 1. Problem

mykka.ai's Chrome extension enforces data loss prevention for browser-based AI tools (ChatGPT, Claude.ai, Gemini). It does not cover:

- **Claude Code** — a CLI agent that reads entire codebases, writes files, and runs shell commands. Sensitive data exits via direct API calls with no browser in the path.
- **Cursor** — a VS Code fork whose AI features (autocomplete, chat, agent mode) make API calls through the Electron process, not the browser.
- **GitHub Copilot** — IDE extension, same problem.
- **Any Python/Node/Go script** calling `openai`, `anthropic`, or other AI SDK directly.
- **Any tool released tomorrow** that calls an AI API over HTTPS.

**The common failure mode:** a developer runs an AI agent, the agent reads files containing API keys, database credentials, or PII, and sends that content as context to an external AI API. No browser extension intercepts this. No human reviews the prompt. The data leaves.

MCP-based enforcement was considered and **rejected**: MCP interception costs tokens (each check = one tool call = model processes the response), making every protected session 2-3x more expensive. Developers turn it off.

---

## 2. Solution Overview

**mykka-guard** — a single compiled binary, two enforcement modes, one admin interface.

| Mode | Mechanism | Covers | Token cost |
|---|---|---|---|
| **Hooks mode** | Claude Code `settings.json` hooks | Claude Code exclusively | **Zero** |
| **Proxy mode** | Local HTTPS MITM proxy | Everything (Cursor, scripts, Copilot, any future AI tool) | **Zero** |

Both modes:
- Pull policy from the same `GET /v1/policy` backend endpoint pretzel-console uses
- Run the same detection engine as the Chrome extension
- Report violations to the same audit log
- Are configured and monitored from pretzel-console

---

## 3. Architecture

### 3.1 Binary

Built with **Bun's native compile**: `bun build --compile`. Outputs a self-contained executable with no Node.js/Bun runtime dependency. Four build targets:

| Target | File |
|---|---|
| macOS ARM (Apple Silicon) | `mykka-guard-macos-arm64` |
| macOS x64 (Intel) | `mykka-guard-macos-x64` |
| Linux x64 | `mykka-guard-linux-x64` |
| Windows x64 | `mykka-guard-windows-x64.exe` |

Distributed via GitHub Releases. Self-update via `mykka-guard update` (checks latest release, downloads, replaces self).

### 3.2 Detection Engine

Extracted from `pretzel/src/detection/` into a standalone package: **`@mykka/detect`** (private npm package or workspace package).

Package contents:
```
packages/mykka-detect/
  engine.ts         ← detectPrompt() — pure TS, no browser deps
  normalize.ts
  code-block.ts
  types.ts
  layer1-patterns/
    entropy.ts
    pii.ts          ← luhnCheck, ssnCheck, ibanCheck
  layer3-dictionary/
    exact.ts
    fuzzy.ts
  schema.ts         ← PolicyDoc, Rule types (Zod)
```

**Runtime requirements:** Node.js ≥ 18 or Bun ≥ 1.0 (both expose `crypto.subtle` and `performance.now()` natively).

The Chrome extension, mykka-guard binary, and any future enforcement clients all import `@mykka/detect`. Single source of detection logic.

### 3.3 Policy Sync

Same pattern as the Chrome extension's `pretzel/src/policy/sync.ts`:

1. On startup: `GET /v1/policy/version` → compare to cached version at `~/.mykka/policy.version`
2. If stale: `GET /v1/policy` → save `PolicyDoc` to `~/.mykka/policy.json`
3. If offline: serve cached policy. If no cache exists: fail open (warn only, no blocking) until connection is restored.

**Policy cache location:** `~/.mykka/` (user home directory)

| File | Contents |
|---|---|
| `~/.mykka/token` | Bearer token for API auth (600 permissions) |
| `~/.mykka/policy.json` | Cached `PolicyDoc` |
| `~/.mykka/policy.version` | Version integer of cached policy |
| `~/.mykka/queue.db` | SQLite queue for offline violation events |
| `~/.mykka/ca.key` | Self-signed CA private key (proxy mode only) |
| `~/.mykka/ca.crt` | Self-signed CA certificate (proxy mode only) |

### 3.4 Violation Reporting

**Fire-and-forget async.** The enforcement decision (allow/block) is made synchronously and returned to the caller immediately. Reporting happens in a background task.

```
Report flow:
1. Violation detected → immediately return decision to hook/proxy
2. Background: POST /v1/scans with { clientType: "claude-code-hook" | "local-proxy", ... }
3. If POST fails (offline / server error): write to ~/.mykka/queue.db
4. On next startup / periodic timer: drain queue.db → retry POST
```

`queue.db` schema (Bun SQLite):
```sql
CREATE TABLE IF NOT EXISTS violation_queue (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  payload   TEXT NOT NULL,    -- JSON serialized scan event
  created   INTEGER NOT NULL, -- Unix ms
  attempts  INTEGER DEFAULT 0
);
```

---

## 4. Hooks Mode (Claude Code)

### 4.1 How Claude Code Hooks Work

Claude Code executes shell commands before (`PreToolUse`) and after (`PostToolUse`) each agent tool call. The hook:
- Receives the tool call as JSON on **stdin**
- Returns a JSON decision on **stdout**
- Runs as a **subprocess outside the LLM context** — zero tokens consumed
- Applies regardless of `--dangerously-skip-permissions` flag (hooks are a shell-level contract, not an agent-level policy)

Hook decision format:
```json
// Block:
{"decision": "block", "reason": "Credential detected: AWS secret access key (rule: aws-secret-key)"}

// Allow:
{"decision": "allow"}
// OR: exit 0 with no output (also means allow)
```

### 4.2 Installed Hook Configuration

`mykka-guard setup --claude-code` writes to `~/.claude/settings.json` (global) or `.claude/settings.json` (project, with `--scope=project`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read|Write|Edit|MultiEdit|Bash|WebFetch",
        "hooks": [{ "type": "command", "command": "mykka-guard hook --event pre" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Read",
        "hooks": [{ "type": "command", "command": "mykka-guard hook --event post" }]
      }
    ]
  }
}
```

The `setup` command **merges** into existing `settings.json` — it does not overwrite it.

### 4.3 What mykka-guard Scans Per Tool

#### `Read` tool (PreToolUse + PostToolUse)

**PreToolUse:**
```json
// stdin
{"tool": "Read", "input": {"file_path": "/path/to/file.ts"}}
```

mykka-guard:
1. Opens and reads the file at `file_path` itself
2. Runs `detectPrompt(fileContents, policy, "file")` 
3. If violation: returns `{"decision":"block","reason":"..."}` — Claude Code never reads the file
4. If clean: returns `{"decision":"allow"}`

This ensures file content never enters model context if it contains sensitive data.

**PostToolUse:** also scans (defence-in-depth, in case Claude Code's hook ordering changes).

#### `Write` / `Edit` / `MultiEdit` tools (PreToolUse)

```json
// stdin for Write
{"tool": "Write", "input": {"file_path": "...", "content": "..."}}
// stdin for Edit
{"tool": "Edit", "input": {"file_path": "...", "old_string": "...", "new_string": "..."}}
```

mykka-guard scans `content` or `new_string` for sensitive data the model is about to write to disk. Use case: model accidentally generating output that includes credentials.

#### `Bash` tool (PreToolUse)

```json
{"tool": "Bash", "input": {"command": "curl -H 'Authorization: Bearer sk-ant-...' https://..."}}
```

mykka-guard scans the command string. Detection categories:
- Credential tokens in flags (`-H "Authorization: Bearer <token>"`, `--password`, `--api-key`)
- Credential file reads (`cat ~/.aws/credentials`, `cat ~/.ssh/id_rsa`, `openssl rsa -in *.pem`)
- Potential exfiltration commands (`curl https://external.com -d @<file>`, `wget --post-file`)

Uses the same `PatternRule` and `EntropyRule` rules from the PolicyDoc — no separate Bash rule type needed.

#### `WebFetch` tool (PreToolUse)

Scan URL for credential-shaped query parameters or fragments. Rare but catches cases like `curl "https://api.example.com/data?key=sk-..."`.

### 4.4 Performance Target

| Step | Target |
|---|---|
| Binary cold start | < 8ms |
| Policy load from cache | < 3ms |
| Detection on 10KB text | < 5ms |
| **Total per hook invocation** | **< 15ms** |

Measurement: `mykka-guard benchmark` command runs 100 iterations against a sample file, prints p50/p95/p99.

### 4.5 Subject Resolution

`GET /v1/policy` (authenticated with user's API key) returns a `PolicyDoc` already compiled for the authenticated user — subject memberships are resolved server-side. The guard binary uses `subjects[*].rules` directly.

**`destinations` field:** ignored in hooks mode. All rules apply to all tool calls regardless of destination. Rationale: file content is data-layer enforcement, not destination-layer.

---

## 5. Proxy Mode (Universal Coverage)

### 5.1 How It Works

`mykka-guard daemon start` launches a local HTTPS proxy:
- Listens on `127.0.0.1:8877` (configurable via `--port`)
- Intercepts HTTPS connections to configured AI API domains
- Terminates TLS using a locally-generated CA certificate
- Scans the outbound HTTP request body
- Allows or blocks before forwarding

```
Developer's tool (Cursor, script, Copilot)
         │
         │  HTTPS to api.anthropic.com
         ▼
mykka-guard daemon (127.0.0.1:8877)
         │
         │  TLS termination (local CA cert)
         │  → extract messages[].content where role = "user"
         │  → extract system prompt
         │  → run detectPrompt()
         │
         │  [allow] → re-encrypt → forward to api.anthropic.com
         │  [block]  → return 403 + JSON violation details
         ▼
api.anthropic.com (or api.openai.com, etc.)
```

### 5.2 TLS Interception Setup

The proxy performs TLS termination (MITM) which requires the client to trust the proxy's CA certificate.

**Two setup paths:**

**Path A — Application-level (recommended, no sudo):**

`mykka-guard daemon setup --cursor` writes to `~/.cursor/settings.json`:
```json
{
  "http.proxy": "http://127.0.0.1:8877",
  "http.proxyStrictSSL": false
}
```

Same for VS Code: `mykka-guard daemon setup --vscode` writes to `~/.vscode/settings.json`.

Coverage: Cursor and VS Code AI features. Does not cover command-line tools.

**Path B — System-level (full coverage, requires one-time sudo/admin):**

`mykka-guard daemon setup --system`:
1. Generates CA keypair → `~/.mykka/ca.key` + `~/.mykka/ca.crt`
2. Installs CA to OS trust store:
   - macOS: `security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.mykka/ca.crt`
   - Windows: `certutil -addstore Root ~/.mykka/ca.crt`
   - Linux: copies to `/usr/local/share/ca-certificates/`, runs `update-ca-certificates`
3. Appends to shell profile (`~/.zshrc`, `~/.bashrc`, `~/.profile`):
   ```bash
   export HTTPS_PROXY=http://127.0.0.1:8877
   export SSL_CERT_FILE=~/.mykka/ca.crt  # for Python/Go/Rust
   export NODE_EXTRA_CA_CERTS=~/.mykka/ca.crt  # for Node.js
   ```

Coverage: all HTTPS traffic from command-line AI tools, scripts, and IDEs.

**Path C — Enterprise MDM (zero user friction):**

IT deploys via Intune/Jamf:
1. Push CA cert to machine trust store
2. Deploy `mykka-guard` binary to `/usr/local/bin/` (macOS) or `C:\Program Files\mykka\` (Windows)
3. Register as a Launch Agent (macOS) or Windows Service
4. Set machine-level env vars or VS Code settings

This is standard MDM practice. Same pattern as CrowdStrike Falcon, Zscaler ZPA.

### 5.3 Configured API Domains

Admin configures which domains the proxy intercepts in pretzel-console. Defaults:

```
api.anthropic.com
api.openai.com
generativelanguage.googleapis.com  (Gemini)
```

Custom domains (e.g., Azure OpenAI endpoint, private model hosted at company.internal) are added in pretzel-console → Settings → Agent Coverage.

### 5.4 What Gets Scanned

**Scanned (outbound request bodies):**
- Anthropic format: `messages[].content` where `role === "user"`, `system` field
- OpenAI format: `messages[].content` where `role === "user"` or `role === "system"`
- Any other endpoint: full request body as text

**Not scanned:**
- Response bodies — AI-generated content, not user data. Streamed through unchanged with no buffering.
- Request headers — future enhancement (could scan `Authorization` headers for accidental credential passing)

### 5.5 Streaming Responses

AI APIs return SSE (Server-Sent Events) streams for most requests. The proxy:
1. **Buffers the complete outbound request** (small, typically < 100KB)
2. **Runs detection on the request**
3. **Streams the response** from the AI API back to the client without buffering

This means: no additional latency on response delivery. Developers feel no difference in typing response quality.

### 5.6 Block Response Format

When a violation is detected, the proxy returns:
```
HTTP 403 Forbidden
Content-Type: application/json

{
  "error": "mykka_policy_violation",
  "message": "Request blocked: credential detected (rule: aws-secret-key)",
  "ruleId": "aws-secret-key",
  "severity": "critical",
  "suggestion": "Remove the credential from your prompt. Check mykka.ai/console for the full report."
}
```

---

## 6. CLI Interface

```
mykka-guard <command> [options]

Commands:
  login                      Authenticate with mykka.ai (opens browser)
  logout                     Remove stored credentials
  install                    Auto-detect AI tools and configure protection
  setup --claude-code        Configure Claude Code hooks
         --cursor            Configure Cursor proxy settings
         --vscode            Configure VS Code proxy settings  
         --system            Install CA cert + system-wide proxy env vars
  daemon start               Start the proxy daemon (foreground)
  daemon stop                Stop the daemon
  daemon status              Show daemon status, intercepted domains
  hook --event pre|post      Hook handler (called by Claude Code, not directly)
  sync                       Force policy sync from server
  status                     Show policy version, last sync, coverage summary
  update                     Update binary to latest release
  benchmark                  Run latency benchmark (100 iterations)
  logs [--tail N]            Show recent violation log
```

### `mykka-guard install` flow

```
$ mykka-guard install

Detecting AI tools...
  ✅ Claude Code found (~/.claude/settings.json)
  ✅ Cursor found (~/.cursor/settings.json)
  ○  VS Code not found
  ○  Claude Desktop not found

Configuring Claude Code hooks... done
Configuring Cursor proxy... done

Coverage summary:
  Claude Code    ✅ Protected (hooks mode, zero tokens)
  Cursor         ✅ Protected (proxy mode, application-level)
  System-wide    ○  Not configured
                    → Run `mykka-guard setup --system` for full OS coverage
                       (covers scripts, Jupyter, any future AI tool)

Policy synced. 47 rules active. Last sync: just now.

mykka-guard is running. Your AI agent activity is protected.
```

---

## 7. pretzel-console Changes Required

### 7.1 Backend API

**`POST /v1/scans`** — add `clientType` field:
```typescript
clientType: z.enum([
  "chrome-extension",
  "claude-code-hook",
  "local-proxy",
  "git-hook",
  "ci-cd",
]).default("chrome-extension")
```

**`POST /v1/api-keys`** — generate long-lived API keys for non-browser clients:
```typescript
// Request
{ name: string, scopes: ["policy:read", "scans:write"] }
// Response  
{ id: string, key: "mykka_live_...", createdAt: string }
```

Keys are scoped to a specific user (the key-holder's policy applies). The `GET /v1/policy` endpoint must accept `Authorization: Bearer mykka_live_...` in addition to Clerk JWTs.

**`GET /v1/agent-coverage`** — per-member client status for Coverage Map:
```typescript
// Response
{
  members: [{
    userId: string,
    email: string,
    clients: {
      "chrome-extension": { installed: boolean, lastSeen: string | null },
      "claude-code-hook": { installed: boolean, lastSeen: string | null },
      "local-proxy":      { installed: boolean, lastSeen: string | null },
    }
  }]
}
```

Populated from `clientType` and `userId` on recent scan records.

### 7.2 pretzel-console UI

**Settings → API Keys** — new page:
- List existing API keys (name, created, last used, scopes)
- Generate new key (show once on creation)
- Revoke key

**Team → Coverage Map** — new view:
- Table: member × client type, showing green/grey/red (active / inactive / never)
- "Last active" timestamp per client per member
- Export as CSV for audit evidence
- "Send setup instructions" button → emails the member a link to `docs.mykka.ai/install`

**Reports → filter by Client Type** — dropdown on existing violation report views

### 7.3 Settings Additions (pretzel-console)

**Settings → Agent Coverage → Intercepted Domains** (proxy mode):
- Default list (Anthropic, OpenAI, Gemini)
- Add custom domains (Azure OpenAI endpoint, private LLM URLs)
- Per-domain: enable/disable, action override (warn vs block)

---

## 8. `@mykka/detect` Package

### 8.1 Purpose

Extract `pretzel/src/detection/` and `pretzel/src/policy/schema.ts` into a standalone npm package. This:
- Removes Vite path alias dependency (`@/` → relative imports)
- Lets mykka-guard import the detection engine without pulling in browser extension code
- Enables future enforcement clients (git hooks, Jupyter extension) to import the same package
- Enables third-party developers to integrate mykka detection into their own AI applications

### 8.2 Public API

```typescript
import { detectPrompt, type PolicyDoc, type DetectionResult } from "@mykka/detect";

const result: DetectionResult = await detectPrompt(
  text,         // string — the text to scan
  policyDoc,    // PolicyDoc — from GET /v1/policy
  "file"        // context hint — "file" | "command" | "http-request"
);

if (result.highestAction === "block") {
  // violation
  console.log(result.findings); // Finding[]
}
```

### 8.3 Extraction Checklist

- [ ] Move `detection/` and relevant parts of `policy/schema.ts` to `packages/mykka-detect/`
- [ ] Replace `@/` aliases with relative imports
- [ ] Replace `chrome.` references (none expected — engine.ts has none)
- [ ] Verify `crypto.subtle` works in Bun test environment
- [ ] Add standalone `vitest` config for the package
- [ ] Port all existing unit tests from `pretzel/tests/unit/detection*` to the package
- [ ] Update `pretzel/` to import from `@mykka/detect` instead of local path
- [ ] Publish to private registry or configure as pnpm workspace package

---

## 9. v1 Scope Boundaries

**In v1:**
- Hooks mode: Claude Code only (Claude Code `settings.json` hooks)
- Proxy mode: Cursor, VS Code, CLI tools via `HTTPS_PROXY`
- Platforms: macOS, Windows, Linux x64
- Scans outbound request content only
- `destinations` field ignored (all rules apply everywhere in guard context)
- No per-tool rule scoping (all rules apply to all tools)

**Out of v1 (future):**
- `toolConfigs` in PolicyDoc for per-tool rule overrides (e.g., "stricter rules on Bash than Read")
- Response scanning (catch AI echoing sensitive data back to client)
- Agentic pipeline scanning (tracking multi-hop data flows across agent steps)
- Browser extension + mykka-guard unified violation correlation ("same credential leaked from Chrome AND Claude Code")
- CLI key onboarding via MDM — silent install without `mykka-guard login`

---

## 10. Rollout Plan

| Phase | What | Audience |
|---|---|---|
| Alpha (weeks 1–3) | mykka-guard hooks mode only. Install manually. No pretzel-console changes yet. | Internal team + 3 design partners |
| Private Beta (weeks 4–6) | Hooks + proxy mode. API keys in pretzel-console. No Coverage Map yet. | 5 enterprise customers (Sofia's list) |
| GA (week 8+) | Full feature set. Coverage Map in console. Published install docs. | All customers |

---

## 11. Open Questions

| Question | Owner | Target |
|---|---|---|
| Does PostToolUse block prevent content reaching model context? | Marcus | Verify vs Claude Code docs before Alpha |
| Which Bun version to compile with for stable binary ABI? | Yuki | Week 1 |
| API key format: use existing `ps_live_` prefix or new `mykka_live_` prefix? | Marcus + Arjun | Before Alpha |
| Windows TLS cert install: `certutil` requires admin — acceptable? | Ben | Week 2 (user research) |
| Policy `destinations` field: remove from guard-facing PolicyDoc or just ignore? | Marcus | Before Private Beta |
