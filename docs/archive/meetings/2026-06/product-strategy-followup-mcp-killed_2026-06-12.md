# Product Strategy Follow-Up: MCP Rejected, Hooks Architecture — Summary
**Date:** June 12, 2026 (emergency follow-up, same day as new-vectors session)
**Triggered by:** Marcus Webb's Slack message flagging MCP token cost problem
**Attendees:** Ethan Cole (CEO), Marcus Webb (CTO), Yuki Tanaka (Extension Engineer), Alexei Petrov (Head of Security Research), Ben Cho (PM), Sofia Reyes (VP Sales)
**Full transcript:** [product-strategy-followup-mcp-killed_2026-06-12_full_transcript.md](product-strategy-followup-mcp-killed_2026-06-12_full_transcript.md)

---

## Key decision

**MCP formally rejected as enforcement layer.** MCP is a *tool* — every interception adds two-way token round-trips. On a 200-file codebase, that's a 3x bill for the developer. They turn it off. Dead product.

**Claude Code hooks are the correct architecture.** Hooks run as OS subprocesses — zero tokens, outside model context entirely, cannot be bypassed with `--dangerously-skip-permissions`.

## Product definition: mykka-guard

A compiled binary. Two modes, same binary:

1. **Claude Code hooks mode** — installs via four lines in `~/.claude/settings.json`; scans file reads (`PostToolUse`), path access (`PreToolUse`), and bash commands
2. **Proxy/daemon mode** — transparent HTTPS proxy; covers every AI tool at OS network level (Cursor, Copilot, scripts, notebooks); enterprise MDM-deployable

## Platform additions needed (shared by all enforcement clients)
- `clientType` field on scan records (`chrome-extension`, `claude-code-hook`, `local-proxy`, etc.)
- Coverage Map — per-member: which clients installed, last policy sync
- API key management for non-browser clients

## Enforcement client roadmap

| Product | Token cost | Timeline |
|---|---|---|
| mykka-guard (hooks mode) | Zero | 4 weeks |
| mykka-guard (proxy/daemon mode) | Zero | 8 weeks |
| `@mykka/detect` npm package (extracted) | N/A | 2 weeks |
| mykka LSP (IDE inline warnings) | N/A | 6–8 weeks |
| mykka JupyterLab extension | Zero | 6 weeks |
| mykka git hook (pre-commit scan) | N/A | 3 weeks |
| mykka GitHub Action (PR pipeline scan) | N/A | 4 weeks |

## Action items
| Owner | Item |
|---|---|
| Marcus Webb + Yuki Tanaka | Build mykka-guard hooks mode binary |
| Ben Cho | Write spec (Monday, June 15) |
| Sofia Reyes | Tell 3 enterprise prospects before product ships — validate reaction |
