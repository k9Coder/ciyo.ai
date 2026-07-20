# Product Strategy — Follow-Up: MCP Killed, Real Architecture
**Date:** June 12, 2026 (later the same day)  
**Triggered by:** Post-meeting Slack thread where Marcus flagged the MCP token problem  
**Attendees:** Ethan Cole (CEO), Marcus Webb (CTO), Yuki Tanaka (Extension Eng), Alexei Petrov (Security Research), Ben Cho (PM), Sofia Reyes (VP Sales)

---

## Why We're Back in the Room

Marcus sent this in Slack after the earlier session ended:

> "MCP is the wrong call. Every tool call the server intercepts = Claude Code has to process the response = tokens consumed. On a 200-file codebase session that's 200 extra tool round-trips. Developer gets a 3x bill. They turn it off. Dead product."

Ethan: "Get back on a call. 30 minutes."

---

## Transcript

---

**MARCUS:** So here's the problem with MCP in one sentence. MCP is a *tool*. Claude calls it, processes the result, pays tokens for both directions. If we enforce policy via MCP, we are literally making every protected Claude Code session more expensive. No developer accepts that long-term regardless of how good the security story is.

---

**YUKI:** I had the same thought after the meeting. The right model isn't MCP. Claude Code has a hooks system. It's built into `settings.json`. You define shell commands that run at lifecycle events — `PreToolUse` fires before any file read, bash call, or write. The hook gets the full tool call as JSON on stdin. It can return `{"decision": "block", "reason": "..."}` and Claude Code stops the tool. Or it returns `{"decision": "allow"}` and it passes through.

---

**ETHAN:** Tokens?

---

**YUKI:** Zero. The hook is a subprocess. It runs completely outside the model context. Claude Code calls the hook, waits for its exit code and stdout, then decides. The LLM never sees it. Not in the prompt, not in the response, not in the token count.

---

**ETHAN:** That's the answer. Why did we say MCP in the first meeting?

---

**MARCUS:** Because it's what everyone's talking about. MCP is the hype. Hooks are a quiet feature buried in the Claude Code docs. But hooks are architecturally correct for enforcement. MCP is architecturally correct for *capability* — giving Claude new tools. We're not adding capability. We're enforcing policy. Wrong layer.

---

**ALEXEI:** The hooks system also has something MCP doesn't: it runs even when the developer uses `--dangerously-skip-permissions`. That flag bypasses *Claude's* judgment, not the OS subprocess hooks. If mykka is a hook, it runs regardless. If mykka is an MCP tool, `--skip-permissions` could bypass it depending on how Anthropic implements it.

---

**YUKI:** Correct. Hooks are pre-tool, pre-model-decision. You can't skip them by telling Claude to be less cautious.

---

**MARCUS:** So the product is: **mykka-guard**, a compiled binary. Developer runs `mykka login` once. Binary caches their policy locally — same `GET /v1/policy` endpoint the Chrome extension uses, same PolicyDoc format, same version-checking. Then they add four lines to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": ".*",
      "hooks": [{"type": "command", "command": "mykka-guard"}]
    }]
  }
}
```

Every tool call — file reads, writes, bash — passes through mykka-guard. If it contains credentials, PII, or whatever their tenant policy defines, it returns block. Async, it fires an event to our backend. Admin sees it in pretzel-console audit log. Zero tokens. Works offline with cached policy.

---

**BEN:** What does mykka-guard actually scan? The file *contents*? The file *path*? Both?

---

**MARCUS:** The `Read` tool input contains the file path. The `Read` tool output contains the content. We hook `PostToolUse` for output scanning — detect after the read, before Claude processes it further. And `PreToolUse` for path scanning — block reads of files that match a sensitive-path policy (like `**/.env`, `**/*.pem`).

---

**ALEXEI:** I want to add a third scan: the `Bash` tool. A command like `cat .env | pbcopy` or `curl -H "Authorization: Bearer $TOKEN"` should also be flaggable. The tool input is the shell command string. We run pattern matching on it. Credential-shaped strings in shell commands are a real exfiltration vector.

---

**ETHAN:** Okay. That's the Claude Code product solved correctly. Now let's do what we didn't finish — the other products. With the constraint: every idea has to connect back to pretzel-console as the policy source. I don't want five separate admin panels. One admin panel, many enforcement clients.

---

**BEN:** That's actually the product model we should name. The extension is an "enforcement client." mykka-guard is an enforcement client. Whatever else we build — same pattern. Admin configures in pretzel-console. Policy compiles to a `PolicyDoc`. Client syncs it. Client enforces it. Client reports violations. The backend doesn't care what kind of client it is.

---

**MARCUS:** We need one new field on scan records: `clientType`. `chrome-extension`, `claude-code-hook`, `local-proxy`, `git-hook` — whatever the source is. Then pretzel-console shows a breakdown: "342 violations last month, 280 from the extension, 62 from claude-code-hook." Admin can filter by source. That's one backend migration, one UI widget. Done.

---

**YUKI:** If we're doing clientType, I want a **Coverage Map** in pretzel-console. Per member: which clients do they have installed, when did each last sync policy. Admin looks at it and sees "12 engineers have the Chrome extension but zero have mykka-guard installed." They can push the install instructions directly from that screen. Companies will love this — it's the "are my people actually protected" view.

---

**SOFIA:** That view closes security-conscious enterprise deals. CISOs do not trust "we deployed it" unless they can see coverage metrics. This is their SOC2 evidence screen.

---

**ETHAN:** That's a premium-tier feature. Background it. What other enforcement clients are we not building?

---

**MARCUS:** The one I keep thinking about: **mykka-daemon**, a local transparent HTTPS proxy. Runs as a background service on the developer's machine. Self-signed CA cert, auto-installed to the OS trust store during setup. Intercepts all traffic to `api.anthropic.com`, `api.openai.com`, and any other AI API endpoint the admin configures in pretzel-console. Scans request bodies. Blocks or logs. Passes through clean traffic.

---

**YUKI:** That covers every AI tool that exists or will ever exist. Cursor, GitHub Copilot, Claude Code not using hooks, any Python script calling OpenAI, a Jupyter notebook, a Slack app. One daemon, total coverage.

---

**ETHAN:** Hard to deploy though. "Install a root certificate and route your AI traffic through our process." That's a major trust ask from the developer.

---

**MARCUS:** For consumer or SMB — hard. For enterprise with MDM — zero friction. IT deploys the cert via Intune or Jamf. IT deploys the daemon via the same MDM. Developer's machine is configured before they even notice. Same way CrowdStrike is deployed.

---

**SOFIA:** Every company that has an MDM already deploys Zscaler or SentinelOne that way. They know this model. It's not weird to them — it's standard.

---

**ALEXEI:** And the daemon doesn't need to be a new product. Frame it as a mode: `mykka-guard --daemon`. Same binary, two modes. Mode 1: Claude Code hook process. Mode 2: local HTTPS proxy service. Same policy sync, same violation reporting, same admin console.

---

**ETHAN:** One binary, two modes. Good. What else.

---

**YUKI:** **mykka LSP** — a Language Server Protocol server. IDE-agnostic. VS Code, Neovim, JetBrains, Zed — all support LSP. The LSP server analyzes open files in real-time and shows inline warnings: this file contains what looks like a database connection string, flagged under your policy's credential rules. Not intercepting AI calls — telling the developer "if you paste this file into an AI, it will be blocked." Proactive, not reactive.

---

**BEN:** That's a different UX than blocking. That's developer education. "Before you copy-paste, know what's in here."

---

**YUKI:** Exactly. And the rule engine is already there — `engine.ts` in pretzel/src/detection has zero browser dependencies. It's pure TS. We extract it into a standalone `@mykka/detect` package. The LSP server imports it directly. The Chrome extension imports it. mykka-guard imports it. One detection codebase, multiple runtimes.

---

**MARCUS:** I've been wanting to extract that package for a while. It's the right call architecturally and it opens a developer product: **`@mykka/detect` on npm**. Open-source, MIT license. Companies building their own AI applications integrate it into their pre-send pipeline. They call `detect(text, policy)` and get violations back. Policy can be hardcoded or fetched from our API. B2B2C model — they're embedding our detection in their product.

---

**PRIYA:** *(joining late)* What did I miss?

---

**ETHAN:** MCP is dead, hooks binary is the Claude Code product, we're extracting the detection engine as a library. We're also talking about an LSP server and a local proxy daemon.

---

**PRIYA:** Okay. One product nobody's mentioned that I think is huge: **mykka for Jupyter**. Data scientists are the worst-offending cohort for AI data leakage. They have DataFrames with actual customer PII — names, emails, transaction histories — and they paste them into ChatGPT to debug their pandas code. The browser extension catches some of it, but Jupyter runs in localhost and the iframe structure is weird — our adapters have patchy coverage there.

A first-party JupyterLab extension that natively intercepts the "send to AI" action in Jupyter AI and similar plugins. Same pretzel-console policy. Marketed separately to data teams — different buyer than CISO, sometimes it's the Head of Data or Chief Data Officer.

---

**ALEXEI:** The data science angle is underrated. HIPAA violations from AI prompts are almost entirely from data teams who think local notebooks are safe. They're not. The data goes to OpenAI or Anthropic servers regardless of where the notebook runs.

---

**SOFIA:** Different buyer, different use case — is that two products or one product with two buyers?

---

**BEN:** Same detection engine, same policy backend, same pretzel-console. It's one product with two personas. We just need the JupyterLab extension as a new enforcement client. Four-line registration in pretzel-console: "mykka Jupyter is now connected."

---

**ETHAN:** Now I want to pitch one. **mykka git hooks.** A `pre-commit` hook. Scans staged files for policy violations before a commit goes through. The pitch isn't "DLP" — the pitch is "your entire codebase is about to be the context window for an AI agent. We tell you which files are landmines before the agent reads them."

---

**MARCUS:** That's actually a really powerful mental model flip. We're not just intercepting AI prompts. We're flagging sensitive content *before it gets into repositories* where agents will pick it up. Prevention before the AI even exists in the workflow.

---

**YUKI:** The git hook also solves an edge case we haven't addressed: what about `git diff | claude` — piping diffs into Claude Code or any LLM from the command line? No tool call, just stdin. Hooks don't catch that. A pre-commit scan at least ensures the committed code doesn't have secrets that a future `git diff | claude` would expose.

---

**ALEXEI:** Good. I want to add one more to this list that nobody will think of until it's too late: **mykka for CI/CD**. Same concept as git hooks but at the pipeline level. GitHub Action. You run `mykka scan --staged` in your PR pipeline and it fails the check if any file in the PR contains content that violates policy. This protects the *codebase* as a whole from accumulating sensitive data that future AI agents will read.

The connection to pretzel-console: the GitHub Action authenticates with a repo-scoped API key that the admin generates in pretzel-console. Policy applies the same way. Violations appear in the same audit log tagged `clientType: ci-cd`.

---

**BEN:** Can I list what we now have and see if people agree?

---

**ETHAN:** Go.

---

**BEN:**

**Enforcement Clients — same policy engine, same pretzel-console admin:**

1. **mykka Chrome Extension** — existing, browser prompts *(shipping)*
2. **mykka-guard (Claude Code hooks mode)** — zero-token Claude Code enforcement. Ships as binary, installs via `settings.json`. *(build now)*
3. **mykka-guard (daemon/proxy mode)** — same binary, second mode, transparent HTTPS proxy for full OS-level coverage. *(build after hooks mode)*
4. **mykka LSP** — inline file warnings in any IDE. Powered by extracted `@mykka/detect` npm package. *(medium term)*
5. **mykka JupyterLab Extension** — data science enforcement client. Same detection, same policy, different channel. *(medium term)*
6. **mykka git hook** — pre-commit scan. Flags sensitive files before they enter the repo AI agents will read. *(quick win, mostly CLI)*
7. **mykka CI/CD (GitHub Action)** — pipeline-level scan. Policy-backed, repo API key, same audit log. *(medium term)*

**Platform layer — what pretzel-console gains to support all of the above:**
- `clientType` on scan/violation records
- Coverage Map (per-member client installation status)
- API key management for non-browser clients
- Per-client enforcement settings (block in Chrome, warn in LSP)

**Library:**
- `@mykka/detect` — extracted npm package. Open-source. Powers all clients and enables third-party integration.

---

**ETHAN:** That's the product map. Not one product — one platform, seven enforcement clients, one admin surface. The pitch becomes: "wherever your people use AI, mykka enforces your policy." That's a completely different story than "we have a Chrome extension."

---

**SOFIA:** I can sell that. That sentence — "wherever your people use AI, mykka enforces your policy" — that's the deck title.

---

**MARCUS:** Priority order from engineering: mykka-guard hooks mode first. It's a single binary. We use Bun's compile command — `bun build --compile` — and we get a self-contained executable with zero Node.js dependency. Cross-platform (Windows, Mac, Linux). Policy sync is already designed by the Chrome extension's `sync.ts` — we reuse that pattern. Detection engine becomes `@mykka/detect`. Timeline: two weeks for an internal alpha, four weeks for private beta.

---

**ETHAN:** Ship it. Ben, spec it Monday. Marcus, you and Yuki own the build. Sofia — I want you to tell three enterprise prospects about this before we have a product. Watch the reaction. That is our product validation.

---

*Session ended.*

---

## Revised Priority Snapshot

| Product | What it is | Token cost | Admin config in pretzel-console | Timeline |
|---|---|---|---|---|
| mykka-guard (hooks) | Claude Code hook binary | **Zero** | ✅ same PolicyDoc | 4 weeks |
| mykka-guard (proxy) | Local HTTPS MITM daemon | **Zero** | ✅ configurable domains | 8 weeks |
| `@mykka/detect` npm | Open-source detection library | N/A | ✅ PolicyDoc as input | 2 weeks (extract) |
| mykka LSP | IDE file-level inline warnings | N/A | ✅ rule categories | 6-8 weeks |
| mykka JupyterLab ext | Jupyter AI interception | **Zero** | ✅ same policy | 6 weeks |
| mykka git hook | pre-commit sensitive file scan | N/A | ✅ policy + API key | 3 weeks |
| mykka GitHub Action | PR pipeline scan | N/A | ✅ repo API key + audit log | 4 weeks |

**What pretzel-console gains (once, shared by all):**
- `clientType` on scan records
- Coverage Map per-member dashboard
- Non-browser API key management (git, CI, daemon)
- Per-client enforcement mode (block / warn / log-only)

---

*Note: "MCP as enforcement layer" formally rejected. MCP is for capability extension (giving Claude new tools), not policy enforcement. Policy enforcement lives in hooks, proxies, and pre-send interception — all zero-token paths.*
