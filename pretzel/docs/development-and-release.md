---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - pretzel/package.json
  - pretzel/manifest.config.ts
  - pretzel/vite.config.ts
  - pretzel/playwright.config.ts
  - pretzel/e2e/fixtures-server.mjs
  - .github/workflows/pretzel-release.yml
  - .github/workflows/e2e.yml
---

# Development and release

## Build modes

```powershell
cd pretzel
pnpm build:staging
pnpm build:prod
```

Vite bakes environment variables into `dist/`; staging and production are separate artifacts. The manifest version and About-page version both come from `pretzel/package.json`.

Production builds include only the four production AI hosts. Development/test builds add the localhost E2E fixture host.

## Local verification

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

E2E loads `dist/` into Chromium and starts `e2e/fixtures-server.mjs` on port `9876`. Build before E2E so the loaded extension reflects the source under test.

The repository-level E2E workflow builds the extension and runs the cross-package suite on pushes and pull requests to `master` and `staging`.

## Release

1. Update `version` in `pretzel/package.json`.
2. Build and test the intended commit.
3. Create a matching tag such as `pretzel-v2.1.0`.
4. Push the tag.

The `pretzel-v*` tag triggers `.github/workflows/pretzel-release.yml`. The workflow:

1. installs pnpm 9 and Node.js 20 dependencies from `pretzel/pnpm-lock.yaml`;
2. runs `pnpm build:prod` with production Clerk and API-base secrets;
3. zips the contents of `pretzel/dist/`;
4. creates a GitHub Release with generated notes and the ZIP;
5. sends a Discord status notification.

The workflow does not publish to the Chrome Web Store. A release owner must download the GitHub Release ZIP, upload it in the Chrome Web Store Developer Dashboard, add release notes, and submit it for review.

Required GitHub Actions secrets:

- `VITE_CLERK_PUBLISHABLE_KEY_PROD`
- `VITE_API_BASE_PROD`
- `DISCORD_WEBHOOK_URL`

Before tagging, verify the package version matches the tag and that the production environment values target the intended Clerk instance and backend.
