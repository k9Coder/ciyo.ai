---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - pretzel/package.json
  - pretzel/playwright.config.ts
  - pretzel/src/background/service-worker.ts
  - pretzel/src/content/content-script.ts
  - pretzel/src/policy/schema.ts
---

# Pretzel extension working instructions

Pretzel is a Manifest V3 Chrome extension built with TypeScript, React, Vite, and `@crxjs/vite-plugin`.

## Read before changing behavior

- Interception, fail-open cases, auth, and data handling: [docs/runtime-and-data-flow.md](docs/runtime-and-data-flow.md)
- Policy API mapping and offline behavior: [docs/policy-sync-and-bridge.md](docs/policy-sync-and-bridge.md)
- Detection rules: [docs/detection.md](docs/detection.md)
- Host selectors and send interception: [docs/adapters.md](docs/adapters.md)
- Build and release process: [docs/development-and-release.md](docs/development-and-release.md)

## Regression rules

- Run `pnpm test` after any extension change.
- Run `pnpm test:e2e` after changing detection, content interception, overlays, or adapters.
- Run `pnpm test:e2e --grep "policy"` after changing policy schema or synchronization.
- Run the root cross-cutting E2E suite when changing a shared policy, token, or backend API contract.
- Build before E2E: `pnpm build`.

## Documentation rules

- Treat code and tests as the source of truth.
- Keep current-state extension docs under `pretzel/docs/`.
- Every current-state document must include `status`, `owner`, `verified_at`, and `sources` frontmatter.
- State fail-open and lossy policy-bridge behavior explicitly; do not describe planned ML/cloud detection or generic-host support as shipped.
