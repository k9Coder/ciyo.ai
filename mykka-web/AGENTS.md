---
status: current
owner: mykka.ai marketing engineering
verified_at: 2026-06-13
sources:
  - README.md
  - CONTENT_CLAIMS.md
  - package.json
  - app/README.md
  - next.config.ts
  - vercel.json
  - TESTING.md
---

# mykka-web Agent Guide

This package is the public Next.js 16 App Router marketing site.

## Read first

- Read [README.md](README.md) for local setup, deployment, verification, and known issues.
- Read [app/README.md](app/README.md) before changing routes, navigation, metadata, sitemap, robots, or dynamic content.
- Read [CONTENT_CLAIMS.md](CONTENT_CLAIMS.md) before changing product, pricing, security, compliance, customer, statistical, legal, or SLA claims.
- For Next.js behavior, consult the installed `node_modules/next/dist/docs/` guidance because this package uses Next.js 16.

## Invariants

- Development runs on port `4000`; Docker runtime runs on port `3001`.
- Use `APP_URL` from `lib/config.ts` for console/app links instead of hard-coding the app origin.
- Keep dynamic solution slugs aligned with `generateStaticParams`, route links, and `app/sitemap.ts`.
- Keep dynamic blog slugs aligned with `lib/posts.ts` and `app/sitemap.ts`.
- Treat `NEXT_PUBLIC_*` values as public configuration, never secrets.
- Do not present a claim as code-backed merely because it appears in JSX or `lib/posts.ts`.
- Do not add or materially change an external claim without recording its owner, evidence status, and source in `CONTENT_CLAIMS.md`.

## Verification

For every change run:

```bash
pnpm lint
pnpm test
pnpm build
```

`pnpm test` runs the vitest unit suite (see [TESTING.md](TESTING.md)) — currently pure-logic coverage for `lib/posts.ts`, `app/download/getDownloads.ts`, and `lib/env.ts`. No component/integration tests yet.

Also manually verify affected routes, mobile navigation when relevant, outbound CTAs, metadata, and dynamic 404 behavior.

## Documentation rule

When routes, port behavior, configuration, deployment, verification, known issues, or claims change, update the corresponding package Markdown in the same change. Every package Markdown document must retain `status`, `owner`, `verified_at`, and `sources` frontmatter.
