# Pretzel (Chrome Extension)

Manifest V3 extension. TypeScript, React, Vite, Zustand. Built to `dist/`.

## Test suite

| Layer | Command | What it covers |
|---|---|---|
| Unit | `pnpm test` | Files in `tests/unit/` — detection engine, policy logic, shared utilities |
| Extension E2E | `pnpm test:e2e` | Playwright specs in `e2e/` — loads the built extension in a real Chromium, tests detection and policy sync against fixture pages |

## Regression rule

**After every bug fix or feature change, run the relevant tests before calling the work done.**

- Changed detection logic (`src/detection/`)? → `pnpm test` (unit) + `pnpm test:e2e`
- Changed policy schema or sync (`src/policy/`)? → `pnpm test` + `pnpm test:e2e --grep "policy"`
- Changed the options / popup UI? → `pnpm test:e2e --grep "options"`
- Changed the content script or overlay? → `pnpm test:e2e`
- Any change at all → run `pnpm test` at minimum

If a test breaks because you intentionally changed behaviour, **update the test** to match. Don't skip or delete it.

## E2E prerequisites

Extension E2E requires a built `dist/` and the fixture server:

```
pnpm build             # produces dist/
pnpm test:e2e          # starts fixtures-server.mjs at :9876 automatically
```

The fixture pages live in `e2e/fixtures/`. Add a new fixture HTML file there when testing a new AI site integration.
