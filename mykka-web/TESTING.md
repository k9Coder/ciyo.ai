# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast, trust your instincts, and ship with confidence — without them, vibe coding is just yolo coding. With tests, it's a superpower.

## Framework

vitest 3 (`node` test environment) + `@testing-library/react` + `@testing-library/jest-dom` for future component tests.

`@vitejs/plugin-react` is installed but intentionally **not** wired into `vitest.config.mts` yet — the current suite is pure-logic (no JSX under test), and the plugin's ESM-only build triggers a broken Vite/rolldown config-bundling path on this toolchain. Add it back to `plugins: []` in `vitest.config.mts` when the first component test needs JSX transform, and re-verify `pnpm test` still runs clean on your platform first.

## Running tests

```bash
pnpm test
```

Runs `vitest run` (single pass, no watch mode).

## Test layers

- **Unit tests** (`lib/*.test.ts`, `app/**/*.test.ts`): pure logic and data-shape invariants — e.g. `lib/posts.test.ts` (sort order, slug uniqueness), `app/download/getDownloads.test.ts` (blob-list parsing, error fallback), `lib/env.test.ts` (env var defaults).
- **Integration/component tests**: none yet. Use `@testing-library/react` + jsdom when added (see Framework note above about re-enabling the plugin).
- **E2E**: out of scope for mykka-web's own suite — cross-service E2E lives in `e2e/` at the repo root (see root `AGENTS.md`).

## Conventions

- File naming: `<name>.test.ts` colocated next to the file under test.
- Mock external services (`@vercel/blob`, etc.) with `vi.mock(...)` — never hit real network/storage in unit tests.
- Assert real behavior (`expect(x).toBe(y)`), never `expect(x).toBeDefined()`.
- `describe`/`it` nesting matches the exported function/module being tested.
