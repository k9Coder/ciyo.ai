---
status: planned
owner: product
verified_at: 2026-06-17
sources:
  - docs/product/ciyo-guard.md
  - company/meetings/product-strategy-followup-mcp-killed_2026-06-12.md
---

# Roadmap

Nothing in this file is implemented unless also described in current-state package or architecture documentation.

## Active Direction

### ciyo-guard

A compiled local enforcement client intended to protect developer AI workflows beyond browser sites.

- Claude Code hook mode scans relevant tool inputs before model access.
- Proxy/daemon mode scans outbound AI API request bodies.
- Offline policy cache and queued violation reporting.
- API-key management and coverage reporting in Pretzel Console.

### Shared Detection Package

Extract the extension detection engine into a portable `@ciyo/detect` package used by both Pretzel and ciyo-guard.

## Future Candidates

- Separate local browser audit and backend event retention controls.
- Administrator-configured HTTPS AI sites using explicit per-site user permission.
- Git hooks and CI/PR scanning
- IDE/LSP and Jupyter integrations
- Coverage map and client-type reporting
- Policy templates and compliance exports

## Scheduled Trust Projects

### Audit And Event Retention

Planned retention controls:

- `localAuditRetentionDays`: tenant configurable, default `30`, valid range `1-365`.
- `backendEventRetentionDays`: tenant configurable, default `90`, valid range `30-730`.
- Raw aggregate scan rows remain on a separate fixed 90-day retention.
- Extension local pruning should run on install, startup, and a daily Chrome alarm.
- Backend event purging should be tenant-scoped, idempotent, and scheduled daily.

### Arbitrary-Site Support

Planned site support:

- ChatGPT, Claude, and Gemini remain built-in static permissions.
- Additional HTTPS AI sites require explicit user permission for the exact origin.
- No blanket all-sites install permission.
- First version supports exact HTTPS hostnames only, with validated selectors and visible per-site states.

Detailed historical designs and implementation plans are archived and are not acceptance criteria.
