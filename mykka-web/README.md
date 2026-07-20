---
status: current
owner: mykka.ai marketing engineering
verified_at: 2026-06-13
sources:
  - package.json
  - next.config.ts
  - vercel.json
  - Dockerfile
  - lib/config.ts
  - app/sitemap.ts
  - ../.github/workflows/mykka-web-deploy.yml
---

# mykka.ai Marketing Site

`mykka-web` is the public mykka.ai and Pretzel marketing site. It is a Next.js 16 App Router application with React 19 and Tailwind CSS 4.

## Run locally

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

The development command explicitly serves `http://localhost:4000`.

To use the committed staging endpoints, run `pnpm set-env:staging` from the monorepo root before starting the site. That script copies `mykka-web/.env.staging` to the gitignored `.env.local`.

## Configuration

| Variable | Required | Behavior |
|---|---:|---|
| `NEXT_PUBLIC_APP_URL` | No | Console/app origin used by sign-in and onboarding links. Defaults to `https://app.mykka.ai`. |
| `NEXT_PUBLIC_ENV` | No | Shows a `STAGING` badge when set to `staging`. |
| `NEXT_PUBLIC_API_BASE` | No current runtime consumer | Passed by the Docker build and CI build, but site source does not currently read it. |

All `NEXT_PUBLIC_*` values are public browser configuration, not secrets.

## Routes and content

See [app/README.md](app/README.md) for the full route map, dynamic route sources, sitemap behavior, and known navigation issues.

Before adding or changing product, pricing, security, compliance, customer, statistical, or SLA language, update and follow [CONTENT_CLAIMS.md](CONTENT_CLAIMS.md).

## Commands and tests

| Command | Purpose |
|---|---|
| `pnpm dev` | Start Next.js on port `4000`. |
| `pnpm lint` | Run ESLint. |
| `pnpm build` | Build and type-check the production application. |
| `pnpm start` | Start a previously built Next.js app using the default Next.js start port unless `PORT` is set. |

There is no automated test command or test suite in this package. The current verification gate is:

```bash
pnpm lint
pnpm build
```

Manually verify changed routes and outbound links, especially dynamic solution/blog pages and onboarding CTAs.

## Deployment

- `next.config.ts` enables `output: 'standalone'`.
- `Dockerfile` builds with Node 20 and runs the standalone server as the `node` user on port `3001`.
- `vercel.json` configures the Next.js build and response security headers.
- Pushes affecting this package on `staging` or `master` run lint and build in GitHub Actions.
- Vercel performs deployment separately; the workflow is a check and notification job, not the deploy mechanism.

## Known issues

- No automated tests exist.
- The footer links to `/changelog`, but no `app/changelog/page.tsx` route exists.
- Product-page screenshots are placeholder panels.
- `NEXT_PUBLIC_API_BASE` is configured in environment/deploy paths but is unused by the current site source.
- Marketing claims include externally verifiable assertions that code cannot substantiate; see [CONTENT_CLAIMS.md](CONTENT_CLAIMS.md).

## Documentation

- [app/README.md](app/README.md): route and content subsystem reference
- [CONTENT_CLAIMS.md](CONTENT_CLAIMS.md): claim evidence and review register
- [AGENTS.md](AGENTS.md): package-specific instructions for coding and content agents
