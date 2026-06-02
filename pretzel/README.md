# pretzel

Chrome extension (Manifest V3). Intercepts AI prompts and blocks sensitive data before it leaves the browser. Built with TypeScript, React, Vite, Zustand.

## Prerequisites

- Node.js ≥ 20
- pnpm
- Google Chrome (for loading the extension)

## How environment variables work

Unlike the web apps, the extension **bakes env vars in at build time** — there is no runtime config. `VITE_API_BASE` and `VITE_CLERK_PUBLISHABLE_KEY` are compiled into the bundle.

This means staging and production are **different builds**, not different runtime configs.

## Building & running

### Staging (developers & testers)

Builds against `localhost:3000` and the Clerk development instance.

```bash
cd pretzel && pnpm build:staging
```

Then load in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `pretzel/dist/` folder
4. Sign in with a staging account (created in Clerk's development instance)

The backend must be running: `cd backend && pnpm dev` (after `pnpm set-env:staging` from root).

To iterate during development (hot-reload — useful for popup/options UI, not content script):
```bash
pnpm dev:staging
```

### Production

```bash
cd pretzel && pnpm build:prod
```

Then zip `dist/` and submit to the Chrome Web Store.

## Environment files

| File | Purpose |
|---|---|
| `.env.staging` | Staging vars — committed, test keys only |
| `.env.prod` | Prod vars — **gitignored**, fill in `pk_live_` key locally |
| `.env.example` | Template |
| `.env` | Used only with plain `pnpm dev` (no `--mode`) |

## Clerk + extension ID

The extension authenticates users via `@clerk/chrome-extension`. Clerk must know the extension's Chrome ID to trust it.

**For staging (development Clerk instance):**
1. Load the extension as unpacked → Chrome shows the extension ID at `chrome://extensions`
2. In Clerk dashboard → your app → **Development instance** → Configure → **Allowed origins**
3. Add: `chrome-extension://<your-extension-id>`

The ID stays consistent as long as you load the same `dist/` folder from the same Chrome profile. If you delete and reload it, Chrome may assign a new ID — re-add it to Clerk.

**For production:**
Once the extension is published to the Chrome Web Store it gets a permanent ID.
1. Note the Chrome Web Store extension ID
2. In Clerk dashboard → **Production instance** → Configure → **Allowed origins**
3. Add: `chrome-extension://<chrome-web-store-id>`

## Tests

```bash
pnpm test            # unit tests (Vitest)
pnpm test:watch      # watch mode

# E2E — loads the built extension in real Chromium
pnpm build && pnpm test:e2e
```

---

## Releasing a New Version

1. **Bump the version** in `manifest.config.ts`:
   ```ts
   version: "2.1.0",
   ```

2. **Commit and push to `master`:**
   ```bash
   git add pretzel/manifest.config.ts
   git commit -m "chore(pretzel): bump version to 2.1.0"
   git push origin master
   ```

3. **Tag the release** (this triggers the build):
   ```bash
   git tag pretzel-v2.1.0
   git push --tags
   ```

4. **GitHub Actions builds the extension** and creates a GitHub Release with `pretzel-v2.1.0.zip` attached. You will get a Discord notification when it's ready.

5. **Upload to Chrome Web Store:**
   - Open [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Select the Pretzel extension
   - "Upload new package" → download and upload the `.zip` from GitHub Releases
   - Fill in release notes
   - Submit for review (Google typically reviews in 1–3 business days)

### GitHub Secrets required

| Secret | Value |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY_PROD` | `pk_live_...` (production Clerk publishable key) |
| `VITE_API_BASE_PROD` | `https://api.ciyo.ai` (or wherever the prod backend lives) |
| `DISCORD_WEBHOOK_URL` | Discord channel webhook URL |
