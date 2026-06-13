# Product Strategy: New Vectors — Summary
**Date:** June 12, 2026
**Facilitator:** Ethan Cole (CEO)
**Attendees:** Ethan Cole (CEO), Marcus Webb (CTO), Sofia Reyes (VP Sales), Ben Cho (PM), Priya Nair (Head of Marketing), Alexei Petrov (Head of Security Research), James Okafor (Head of CS), Yuki Tanaka (Extension Engineer)
**Full transcript:** [product-strategy-new-vectors_2026-06-12_full_transcript.md](product-strategy-new-vectors_2026-06-12_full_transcript.md)

---

## Context

Every deal above ~500 seats hits the same objection: Chrome extension only. Devs live in VS Code, Cursor, CLI. This meeting was called to identify what new product directions to take to investors and customers.

## Decision: build MCP server first

One enforcement client to cover every MCP-compatible AI tool (Claude Code, Cursor in MCP mode, Claude Desktop, future tools). Zero-token architecture. Open-source server, policy sync is the premium feature.

- **Unblocks sales this quarter** — Sofia has stalled deals that close on this
- **Foundation for all other clients** — same PolicyDoc, same tenant model, same audit log
- Security review by Alexei mandatory before GA

## Priority snapshot

**Fast wins (same product, new capabilities):**
- Policy Templates — 2 weeks, Ben
- Audit & Compliance Report exports — Q3, Ben

**Medium bets (new surface, same buyer):**
- ciyo MCP Server — 30–45 days, Marcus + Yuki *(PRIORITY — decided this meeting)*
- VS Code / Cursor IDE extension — 60 days, Yuki

**Big bets (parked, not this quarter):**
- ciyo Desktop Agent / Local Proxy
- ciyo API Gateway / Cloud Relay
- ciyo Slack/Teams App (audit-first)
- ciyo Solo PLG tier

## Action items

| Owner | Item | Deadline |
|---|---|---|
| Ben Cho | Write spec for ciyo MCP Server v1 | June 19 |
| Marcus Webb + Yuki Tanaka | Technical architecture for MCP server | June 19 |
| Sofia Reyes | Identify 5 private beta deal candidates | June 16 |
| Ben Cho | Add Policy Templates to backlog, size it | June 16 |
| Ben Cho | Add Compliance Reporting to Q3 roadmap | June 16 |
| Priya Nair | Draft "Pretzel for Agents" positioning doc | June 23 |
| Alexei Petrov | Schedule threat model review for MCP server | Before MCP GA |
| Ethan Cole | Decide Solo/PLG tier — take to board or defer | July board meeting |
