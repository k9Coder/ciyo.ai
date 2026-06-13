---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - engine.ts
  - types.ts
  - layer1-patterns
  - layer3-dictionary
  - ../../docs/detection.md
---

# Detection Engine

The local detection engine normalizes prompt text and evaluates pattern, entropy, dictionary, and score rules. It returns findings and the highest enforcement action.

Keep this subsystem browser-independent where possible. See [detection reference](../../docs/detection.md).
