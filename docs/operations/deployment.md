---
status: current
owner: platform
verified_at: 2026-06-13
sources:
  - .github/workflows/backend-deploy.yml
  - .github/workflows/pretzel-console-deploy.yml
  - .github/workflows/ciyo-web-deploy.yml
  - .github/workflows/pretzel-release.yml
---

# Deployment

| Surface | Trigger | Mechanism |
|---|---|---|
| Backend | Push to `master` or `staging` affecting backend | Test, build/push GHCR image, trigger Render deploy, then run migrations |
| Pretzel Console | Push to `master` or `staging` affecting console | Test/typecheck, trigger Render static-site deploy hook |
| ciyo-web | Push to `master` or `staging` affecting website | GitHub Actions lint/build check; Vercel Git integration deploys |
| Pretzel extension | Push tag `pretzel-v*` | Build production ZIP and GitHub Release; manual Chrome Web Store upload |

Production configuration is injected by GitHub, Render, and Vercel. Do not depend on local `.env.prod` files being present in CI.

The backend workflow deploys before migrations and therefore requires additive/backward-compatible migrations. This is tracked in [Known Issues](../KNOWN_ISSUES.md).

The console's authoritative hosted deployment is the Render static-site deploy
hook. Its nginx Docker image is a separate local/container artifact and is
currently affected by the Compose/CSP defects in Known Issues.
