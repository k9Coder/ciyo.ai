---
status: current
owner: platform
verified_at: 2026-07-04
sources:
  - .github/workflows
  - pretzel/package.json
  - pretzel/manifest.config.ts
  - pretzel-desktop/package.json
  - pretzel-desktop/build/electron-builder.yml
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

## Desktop App (pretzel-desktop)

### How to release a new version

1. From `pretzel-desktop/`, bump the version and push the release tag:
   ```bash
   pnpm bump-version        # patch bump by default; or: pnpm bump-version minor|major
   pnpm release             # tags pretzel-desktop-v<version> and pushes it
   ```
   (`pretzel-desktop/scripts/bump-version.mjs` / `release.mjs` — bumps `package.json`,
   commits, tags, and pushes for you.)
2. GitHub Actions (`.github/workflows/pretzel-desktop-release.yml`) runs automatically:
   - **macOS job** (`macos-latest`): builds arm64 + x64 `.dmg`, uploads to GitHub Release.
   - **Windows job** (`windows-latest`): builds x64 `.exe` NSIS installer, uploads to GitHub Release.
   - **Linux job** (`ubuntu-latest`): builds `.AppImage` + `.deb`, uploads to GitHub Release.
   - **Notify job**: posts result to Discord with download link.
3. CI takes ~10–15 min. Check Actions tab for progress.
4. electron-builder creates its own GitHub Release under tag `v<version>` (NOT the
   `pretzel-desktop-v<version>` git tag that triggered the build) — as a **draft**:
   `https://github.com/yarin-mag/mykka.ai/releases/tag/v1.1.0`
5. **Required manual step:** from `mykka-web/`, publish the new installers to Vercel Blob
   (this is what `mykka.ai/download` actually serves — see below):
   ```bash
   pnpm publish-blob:staging   # test first
   pnpm publish-blob:prod
   ```
   (`mykka-web/scripts/publish-desktop-blob.mjs` — downloads the four installers from the
   `v<version>` GitHub Release, uploads them to Vercel Blob under `pretzel-desktop/`, and
   deletes the previous version's blobs so the store doesn't grow unbounded.)

### How download links stay current on mykka.ai and the console

**Downloads are served from Vercel Blob, not GitHub directly** (`mykka-web/app/download/getDownloads.ts`
calls `list({ prefix: 'pretzel-desktop/' })`) — this changed from the original GitHub-API-direct
design because GitHub blocks/warns on release assets this large over its API.  Nothing pushes
new GitHub Release assets into Blob automatically — **you must run `pnpm publish-blob:prod`
(step 5 above) after every release**, or `mykka.ai/download` keeps serving the old version.

- **`mykka.ai/download`**: reads directly from the Vercel Blob store — updates the moment
  `publish-blob:prod` finishes, no redeploy needed.
- **`pretzel-console` Settings → Desktop Agent section**: links point to `mykka.ai/download`,
  so it inherits the same Blob-backed data with no separate action needed.
- **In-app auto-updater** (`electron-updater`): checks GitHub Releases (not Blob) on startup
  and every 2h, so already-installed apps still auto-update straight from the GitHub Release
  regardless of the Blob publish step.

### Required GitHub secrets

| Secret | Used for |
|---|---|
| `GITHUB_TOKEN` | Uploading release assets (automatic, no setup needed) |
| `PRETZEL_DESKTOP_API_URL` | Backend URL baked into the app binary |
| `VITE_CLERK_PUBLISHABLE_KEY_PROD` | Clerk auth key baked into the app binary |
| `DISCORD_WEBHOOK_URL` | Release notification |

### Current signing status

**Unsigned beta** — macOS shows "unverified developer" on first open (right-click → Open → OK).
Windows shows SmartScreen warning (More info → Run anyway). Normal for pre-launch beta.

### TODO: Apple code signing (before public launch)

**Owner:** Ryan Kowalski (infrastructure) + Sam Rivera (desktop)

Steps to add signing:
1. Enroll in Apple Developer Program ($99/yr) at developer.apple.com/programs/enroll
2. Generate a Developer ID Application certificate (see instructions below or ask Sam)
3. Add these GitHub secrets: `APPLE_CERTIFICATE_BASE64`, `APPLE_CERTIFICATE_PASSWORD`,
   `KEYCHAIN_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
4. Restore the signing steps in `.github/workflows/pretzel-desktop-release.yml`
   (commented steps are preserved in git history — commit `TODO: restore signing`)
5. For Windows Authenticode: buy cert from DigiCert/Sectigo, add `WIN_CSC_BASE64` + `WIN_CSC_KEY_PASSWORD`

Signing is required before:
- Distributing to non-technical users at scale
- Enterprise IT MDM deployment (unsigned apps are blocked by default policy)
- Silent auto-updates on macOS (notarization required)

---

## Before Release

- Run package tests/typechecks.
- Run relevant unified E2E projects from `e2e/`.
- Run `pnpm docs:check`.
- Review [Known Issues](../KNOWN_ISSUES.md) for release-impacting gaps.
