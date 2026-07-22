# pretzel-desktop Roadmap Planning — Summary
**Date:** July 14, 2026
**Chair:** Ethan Cole (CEO)
**Attendees:** Marcus Webb (CTO), Ben Cho (PM), Alexei Petrov (Head of Security Research), Noa Katz (CISO)
**Purpose:** Define MVP scope and build timeline for pretzel-desktop — the local HTTPS proxy daemon that intercepts AI API traffic outside the browser. Successor to the formerly named "mykka-guard."
**Full transcript:** [pretzel-desktop-roadmap-planning_2026-07-14_full_transcript.md](pretzel-desktop-roadmap-planning_2026-07-14_full_transcript.md)

---

## Summary

### Context

The Pretzel Chrome extension, even after the fetch/XHR upgrade, is fundamentally limited to browser tabs on permitted domains. It cannot intercept AI API calls made from IDE extensions (Cursor, Copilot, Continue), terminal scripts, notebooks, or desktop applications. pretzel-desktop is the compiled local proxy daemon that fills this gap — it operates at the OS network layer and intercepts all outbound AI API traffic regardless of the client application.

Previously referred to as "mykka-guard" in the roadmap and the June 12 architecture session. Renamed to **pretzel-desktop** to align with the Pretzel product family branding.

---

## Key Decisions

**1. Product renamed from mykka-guard to pretzel-desktop.** All internal documentation, roadmap entries, and code references updated accordingly.

**2. MVP scope is proxy/daemon mode only.** Claude Code hook mode (from the June 12 session) is deferred to v2. The proxy daemon is the higher-value MVP — it covers all non-browser AI clients in one install, whereas hook mode only covers Claude Code. Hook mode ships in v2 once proxy mode is stable.

**3. HTTPS interception via local CA cert.** pretzel-desktop generates a local root certificate authority on install. The user or MDM policy trusts that CA at the OS level. All outbound HTTPS from monitored applications is then interceptable by the local proxy. This is the same approach used by enterprise proxies (Zscaler, Netskope, etc.) and is the only viable method for HTTPS inspection without native TLS key access.

**4. failMode parity with extension.** The same `failMode: "open" | "closed"` policy field added in the extension upgrade governs pretzel-desktop behavior. Both clients read from the same compiled policy snapshot. Console setting controls both.

**5. AI assistant → new server → auto-coverage.** When the policy AI assistant adds a new AI service to a rule, the compiled policy includes that host in the proxy intercept list. pretzel-desktop picks it up on next policy sync (two-minute poll, same as extension). No reinstall required. This is a first-class design requirement, not an afterthought.

**6. Build timeline: Q3 2026 design sprint, Q4 2026 MVP.** Design and architecture sprint begins immediately. MVP target: end of Q4 2026. Enterprise MDM-deployable packaging is a Q4 stretch goal; manual install is the MVP.

---

## MVP Scope (In)

- Local HTTPS proxy listening on loopback (configurable port)
- OS proxy configuration set automatically on install (macOS System Settings, Windows Proxy Settings)
- Local CA cert generation + user-trust prompt on first run
- Intercept and inspect outbound requests to all hosts in the compiled policy
- Run the `@mykka/detect` detection engine against request bodies (shared with extension — extraction of `@mykka/detect` is a prerequisite)
- Enforce rule actions: log, warn (OS notification), block (return 403)
- failMode enforcement: `"open"` (pass through + log) or `"closed"` (block all monitored-host traffic) when policy unavailable
- Policy sync from backend: on start + two-minute poll, same mechanism as extension
- Audit log reporting to backend (same event schema as extension)
- Console coverage reporting: `clientType: "pretzel-desktop"` on scan records so Console shows which members have it installed
- macOS and Windows x64 support for MVP

## MVP Scope (Out / v2)

- Claude Code hook mode
- Full file content scanning (inside PDFs, archives, source files)
- Linux support
- MDM-deployable enterprise packaging (PKG, MSI with silent install + pre-trusted cert)
- Browser traffic deduplication (avoid double-scanning requests already caught by the extension)
- API key management UI in Console

---

## Action Items

| # | Action | Owner | By |
|---|---|---|---|
| 1 | Update roadmap doc: rename mykka-guard → pretzel-desktop, update MVP scope | Ben | July 16 |
| 2 | Extract `@mykka/detect` from extension into shared package (prerequisite for pretzel-desktop) | Marcus (assigns Yuki + Omar) | Q3 sprint start |
| 3 | Architecture design doc: proxy daemon, CA cert, OS proxy config, policy sync | Marcus | July 28 |
| 4 | Threat model for local proxy + CA cert: attack surface, cert theft, bypass vectors | Noa + Tal Ben-David | July 28 |
| 5 | Enterprise CISO requirements checklist (what buyers will audit) | Noa | July 21 |
| 6 | AI assistant → new server flow spec: how new hosts appear in the proxy intercept list | Ben | July 21 |
| 7 | Console: Coverage Map spec — per-member client type + last sync | Ben | July 21 |
| 8 | MDM deployment research: macOS PKG + cert pre-trust, Windows MSI | Marcus | August research spike |
| 9 | MVP build sprint kickoff | Marcus | Q4 2026 |
