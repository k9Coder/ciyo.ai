# Backend

Fastify API server. TypeScript, Drizzle ORM, PostgreSQL.

## Test suite

| Layer | Command | What it covers |
|---|---|---|
| Unit / integration | `pnpm test` | All files in `tests/` — routes, auth, policy compiler, billing, webhooks, DB helpers |
| API E2E | `pnpm test:e2e` | Playwright specs in `e2e/` — requires the server running on `localhost:3000` and a seeded test DB |

## Regression rule

**After every bug fix or feature change, run the relevant tests before calling the work done.**

- Changed a route or middleware? → `pnpm test` (covers route tests) and `pnpm test:e2e --project=api`
- Changed policy compilation / rules / subjects? → `pnpm test` pays special attention to `tests/policy*.test.ts`
- Changed billing logic? → `pnpm test` focusing on `tests/billing/`
- Changed auth (tokens, Clerk webhook)? → `pnpm test` focusing on `tests/clerk*.test.ts` and `tests/tokens.test.ts`
- Changed the seed or teardown scripts? → re-run `pnpm seed:e2e` and then the full `pnpm test:e2e`

If a test breaks because you intentionally changed behaviour, **update the test** — don't delete it or add a skip. If you add a new feature, add tests for it in the matching `tests/*.test.ts` file.

## E2E prerequisites

The API E2E suite (`e2e/`) shares state with the root-level cross-cutting suite. Seed the test DB first:

```
pnpm seed:e2e          # populates .seed-state.json
pnpm test:e2e          # runs all backend e2e specs
pnpm teardown:e2e      # clean up when done
```

Requires `backend/.env` with `DATABASE_URL` pointing to the **test** database (never production).
