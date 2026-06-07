# Pretzel Console (Admin Web App)

React SPA. TypeScript, Vite, TanStack Query, React Router, Clerk auth.

## Test suite

| Layer | Command | What it covers |
|---|---|---|
| Unit / component | `pnpm test` | Files in `tests/` — component rendering, hooks, API client, auth guards |
| Admin E2E | `pnpm test:e2e` | Playwright specs in `e2e/` — full browser flows: login, dashboard, members, policy publish, billing, AI assistant |

## Regression rule

**After every bug fix or feature change, run the relevant tests before calling the work done.**

- Changed a page or component? → `pnpm test` (component tests) + `pnpm test:e2e` for affected spec
- Changed the AI assistant UI or flow? → `pnpm test:e2e --grep "assistant"`
- Changed policy publish flow? → `pnpm test:e2e --grep "publish"`
- Changed billing UI? → `pnpm test:e2e --grep "billing"`
- Changed auth guards or routing? → `pnpm test` + `pnpm test:e2e --grep "auth"`
- Any change at all → run `pnpm test` at minimum

If a test breaks because you intentionally changed behaviour, **update the test**. Don't skip or delete it.

## E2E prerequisites

Admin E2E requires Clerk auth setup and a running backend:

```
# In backend/:
pnpm seed:e2e          # seed test DB

# In pretzel-console/:
pnpm dev               # or have the app running at localhost:5173
pnpm test:e2e          # runs auth setup then all admin specs
```

Requires `pretzel-console/e2e/.env.e2e` with `E2E_CLERK_USER_EMAIL`, `E2E_CLERK_SECRET_KEY`, etc. — see the root `e2e/.env.e2e` for the full list. Never point `E2E_DATABASE_URL` at production.
