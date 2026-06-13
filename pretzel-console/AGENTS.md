---
status: current
owner: ciyo.ai engineering
verified_at: 2026-06-13
sources:
  - README.md
  - package.json
  - src/App.tsx
  - src/components/layout/RequireAuth.tsx
  - src/components/billing/PlanGate.tsx
  - playwright.config.ts
  - e2e/README.md
---

# Pretzel Console Agent Guide

This package is a React 18, TypeScript, Vite, React Router, TanStack Query, and Clerk SPA.

## Read first

- Read [README.md](README.md) for setup, environment, deployment, and known issues.
- Read [src/README.md](src/README.md) before changing routes, authentication, API calls, billing gates, or realtime behavior.
- Read [e2e/README.md](e2e/README.md) before changing browser flows.

## Invariants

- Keep protected application pages beneath `RequireAuth`.
- `RequireAuth` must continue to require sign-in, an active organization, and Clerk role `org:admin`.
- Keep `/assistant` behind `PlanGate feature="assistantEnabled"` unless the product entitlement changes intentionally.
- Use the shared `api` client and TanStack Query hooks rather than calling `fetch` directly from pages.
- Preserve SPA fallback behavior when changing deployment configuration.
- Treat all `VITE_*` values as public browser-bundle configuration, never secrets.
- Do not weaken the SSE token-in-query security TODO or describe it as resolved until the implementation changes.

## Verification

Run `pnpm test` after every change. Also run:

| Change | Required verification |
|---|---|
| TypeScript or shared UI behavior | `pnpm typecheck` |
| Routes or auth gates | `pnpm test` and relevant auth/admin Playwright coverage |
| Assistant UI/apply flow | `pnpm test:e2e --grep "assistant"` and monorepo cross-service assistant coverage |
| Publish flow | `pnpm test:e2e --grep "Publish"` and relevant cross-service coverage |
| Billing UI or entitlement gate | `pnpm test:e2e --grep "Billing"` |
| Shared policy, token, DB, or API contract | Follow the root cross-cutting E2E rule |

Admin Playwright tests mutate seeded backend state. Use only the E2E database and credentials described in [e2e/README.md](e2e/README.md).

## Documentation rule

When routes, gates, environment variables, deployment, test commands, or known issues change, update the corresponding package Markdown in the same change. Every package Markdown document must retain `status`, `owner`, `verified_at`, and `sources` frontmatter.
