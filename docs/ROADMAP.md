---
status: planned
owner: product
verified_at: 2026-06-13
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

- Git hooks and CI/PR scanning
- IDE/LSP and Jupyter integrations
- Coverage map and client-type reporting
- Policy templates and compliance exports

Detailed historical designs and implementation plans are archived and are not acceptance criteria.
