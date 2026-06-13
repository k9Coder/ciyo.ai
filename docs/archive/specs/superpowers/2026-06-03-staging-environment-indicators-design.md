# Staging Environment Indicators

**Date:** 2026-06-03  
**Status:** Approved

## Problem

No visual or logged indication of which environment (staging vs production) is active. Easy to lose track of which env you're running against.

## Solution

Add an explicit `APP_ENV` environment variable to all `.env.staging` files. When set to `"staging"`, each app surfaces a visible indicator. Production stays untouched — no variable set means no indicator shown.

## Environment Variables

| File | Variable | Staging value |
|---|---|---|
| `backend/.env.staging` | `APP_ENV=staging` | `staging` |
| `pretzel-console/.env.staging` | `VITE_APP_ENV=staging` | `staging` |
| `ciyo-web/.env.staging` | `NEXT_PUBLIC_APP_ENV=staging` | `staging` |

Also add to each `.env.example` as a documented but empty entry. Production `.env.prod` files: variable absent (no badge rendered).

## Backend

File: `backend/src/index.ts`

Append `[ENV: staging]` to the existing startup log line when `process.env.APP_ENV` is set:

```
ciyo-api starting on :3000  [ENV: staging]
```

No new log statements — augments the existing `logger.info` call.

## pretzel-console

File: `pretzel-console/src/components/layout/AppLayout.tsx`

Add an amber pill badge in the sidebar logo block, below "by ciyo.ai", when `import.meta.env.VITE_APP_ENV === 'staging'`. Inline style, no new component needed.

```
🥨 Pretzel
   by ciyo.ai
   [STAGING]       ← amber pill, only when VITE_APP_ENV=staging
```

## ciyo-web

File: `ciyo-web/components/layout/Header.tsx`

Add an amber pill badge inline next to "Pretzel" text in the header logo when `process.env.NEXT_PUBLIC_APP_ENV === 'staging'`.

```
🥨 Pretzel [STAGING] by ciyo.ai
```

## Badge Style

Both badges: small uppercase text, amber background (`#f59e0b` / `bg-amber-500`), rounded pill, font-size ~10px. Unobtrusive but clearly visible.

## What's Not Changing

- No production files are modified
- No new components created
- No changes to build pipeline or CI
- `.env` (local dev) files: variable absent by default — developer opts in by adding it manually if desired
