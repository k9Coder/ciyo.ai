---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - pretzel/package.json
  - pretzel/manifest.config.ts
  - pretzel/src/background/service-worker.ts
  - pretzel/src/content/content-script.ts
  - .github/workflows/pretzel-release.yml
---

# Pretzel extension

Pretzel is a Manifest V3 Chrome extension that intercepts prompt sends on supported AI chat hosts, runs local policy detection, and warns or blocks before the host receives the prompt.

## Current behavior

- Production host permissions: `chatgpt.com`, `chat.openai.com`, `claude.ai`, and `gemini.google.com`.
- Detection and the local audit log run in the browser. Network traffic covers policy synchronization, scan-count calls, configured rule-trigger events, Clerk authentication, and optional Sentry error reporting.
- Enforcement requires an auth token. Unauthenticated sends proceed without detection and periodically show a sign-in nudge.
- Interception is intentionally fail-open for missing composers, empty prompts, and detection/message-handler failures.
- A cached backend policy remains active while offline and after subscription `402` responses.

Read [Runtime and data flow](docs/runtime-and-data-flow.md) before changing interception or telemetry behavior.

## Documentation

| Document | Purpose |
|---|---|
| [Runtime and data flow](docs/runtime-and-data-flow.md) | Interception, fail-open behavior, auth priority, backend traffic, and local audit data |
| [Policy sync and bridge](docs/policy-sync-and-bridge.md) | Offline behavior, `402` handling, backend policy mapping, and ignored fields |
| [Detection engine](docs/detection.md) | Rule execution, normalization, actions, and limitations |
| [Host adapters](docs/adapters.md) | Supported hosts, selectors, send interception, and generic adapter limits |
| [Development and release](docs/development-and-release.md) | Builds, tests, versioning, release tags, and Chrome Web Store handoff |

## Develop

Prerequisites: Node.js 20, pnpm, and Chrome/Chromium.

```powershell
cd pretzel
pnpm install
pnpm build:staging
pnpm test
pnpm test:e2e
```

Load `pretzel/dist/` through `chrome://extensions` with Developer mode enabled. Environment variables are baked into the bundle at build time:

- `VITE_API_BASE`, defaulting to `https://api.mykka.ai` when absent
- `VITE_CLERK_PUBLISHABLE_KEY`
- optional `VITE_SENTRY_DSN_EXTENSION`

Use `pnpm dev:staging` for popup/options UI iteration. Content-script changes require a rebuild and extension reload.

## Test selection

| Change | Minimum verification |
|---|---|
| Any extension change | `pnpm test` |
| Detection, content script, overlay, or adapters | `pnpm test` and `pnpm test:e2e` |
| Policy schema or sync | `pnpm test` and `pnpm test:e2e --grep "policy"` |
| Shared API or policy contract | Root cross-cutting E2E suite per the repository instructions |
