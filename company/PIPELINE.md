---
status: current
owner: engineering
verified_at: 2026-06-13
sources:
  - e2e/playwright.config.ts
  - backend/package.json
  - pretzel/package.json
  - pretzel-console/package.json
  - .github/workflows
---

# Development Pipeline

This document defines the intended engineering gate. Current CI defects are listed in [`../docs/KNOWN_ISSUES.md`](../docs/KNOWN_ISSUES.md).

## Flow

1. Product writes acceptance criteria for behavior changes.
2. QA identifies manual and automated coverage.
3. The developer implements code and focused tests.
4. Run package tests and typecheck/build from the package directory.
5. Run relevant unified E2E projects from `e2e/`.
6. Review architecture, security, and cross-package contract impact.
7. Merge and deploy through the configured provider workflow.

## Package Checks

```powershell
cd backend; pnpm test; pnpm build
cd pretzel; pnpm test; pnpm typecheck; pnpm build:staging
cd pretzel-console; pnpm test; pnpm typecheck; pnpm build:staging
cd mykka-web; pnpm lint; pnpm build
```

## Unified E2E

The configuration is `e2e/playwright.config.ts`.

```powershell
cd e2e
pnpm test:e2e
pnpm test:e2e -- --project=api
pnpm test:e2e -- --project=extension
pnpm test:e2e -- --project=cross-service
pnpm test:e2e -- --project=admin
```

Use the full suite for shared contracts, auth/token changes, policy schema/compiler/resolver changes, DB migrations, and release candidates.

## Ownership

- Backend/API/database: Arjun Mehta
- Extension/runtime/detection integration: Yuki Tanaka and Omar Hassan
- Console: Chloe Dubois
- E2E/QA: Natasha Ivanova and Lena Hartmann
- Platform/deployment: Ryan Kowalski
- Cross-package architecture and review: Marcus Webb

Staff files define review lenses and ownership. Code/config and canonical docs define technical reality.
