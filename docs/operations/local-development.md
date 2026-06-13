---
status: current
owner: platform
verified_at: 2026-06-13
sources:
  - scripts/set-env.mjs
  - backend/package.json
  - pretzel/package.json
  - pretzel-console/package.json
  - ciyo-web/package.json
---

# Local Development

## Install

Install dependencies independently in `backend`, `pretzel`, `pretzel-console`, `ciyo-web`, and `e2e`.

## Environment

From the repository root, `node scripts/set-env.mjs staging` copies staging files for backend and ciyo-web. Pretzel and Pretzel Console use Vite modes directly.

## Start The Main Surfaces

```powershell
cd backend; pnpm dev
cd pretzel-console; pnpm dev:staging
cd ciyo-web; pnpm dev
cd pretzel; pnpm build:staging
```

- Backend: `http://localhost:3000`
- Console: normally `http://localhost:5173`
- Website: `http://localhost:4000`
- Extension: load `pretzel/dist/` as an unpacked Chrome extension.

The Docker Compose full-stack path has current console port/CSP defects; see [Known Issues](../KNOWN_ISSUES.md).
