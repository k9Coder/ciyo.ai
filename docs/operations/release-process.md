---
status: current
owner: platform
verified_at: 2026-06-13
sources:
  - .github/workflows
  - pretzel/package.json
  - pretzel/manifest.config.ts
---

# Release Process

## Web Services

Changes on `staging` deploy to staging services. Changes on `master` deploy to production services through their configured provider integrations.

## Extension

1. Update `pretzel/package.json` version. `manifest.config.ts` reads this value.
2. Build and test the production-mode extension.
3. Tag the commit as `pretzel-v<version>` and push the tag.
4. Download the ZIP attached to the generated GitHub Release.
5. Verify the built manifest contains only production hosts.
6. Upload the ZIP manually to Chrome Web Store and submit for review.

## Before Release

- Run package tests/typechecks.
- Run relevant unified E2E projects from `e2e/`.
- Run `pnpm docs:check`.
- Review [Known Issues](../KNOWN_ISSUES.md) for release-impacting gaps.
