---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - registry.ts
  - types.ts
  - chatgpt.ts
  - claude.ts
  - gemini.ts
  - generic.ts
  - ../../../docs/adapters.md
---

# Host Adapters

Adapters define prompt selectors, send interception, and prompt read/write behavior. Production injection is limited by `manifest.config.ts` to ChatGPT, Claude, and Gemini.

A generic adapter does not provide arbitrary-site coverage without manifest authorization. See [adapter reference](../../../docs/adapters.md).
