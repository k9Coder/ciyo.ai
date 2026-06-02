# ciyo-web

Marketing / landing site. Next.js 16, React 19, Tailwind CSS.

## Prerequisites

- Node.js ≥ 20
- pnpm

## Running

### Staging

```bash
# From monorepo root — copies .env.staging to .env.local
pnpm set-env:staging

cd ciyo-web && pnpm dev
```

Open `http://localhost:3001` (Next.js picks a free port if 3000 is taken by the backend).

### Production

```bash
# From monorepo root
pnpm set-env:prod

cd ciyo-web && pnpm build && pnpm start
```

## Environment files

| File | Purpose |
|---|---|
| `.env.staging` | Staging vars — committed, safe to share |
| `.env.prod` | Prod vars — **gitignored**, fill in locally before deploying |
| `.env.local` | Active config — written by `pnpm set-env:*`, gitignored |

`pnpm set-env:staging` copies `.env.staging` → `.env.local`. Next.js loads `.env.local` at the highest priority so plain `pnpm dev` picks it up automatically.

### What goes in `.env.prod`

```dotenv
NEXT_PUBLIC_API_BASE=https://api.ciyo.ai
NEXT_PUBLIC_ENV=production
```

Add any additional `NEXT_PUBLIC_` vars here as the site grows.
