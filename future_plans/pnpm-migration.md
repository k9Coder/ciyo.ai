# pnpm Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardise the entire repo on pnpm. Delete all `package-lock.json` and `yarn.lock` files, add a root `pnpm-workspace.yaml` so the three packages share a single lockfile, and update every `README.md` to use `pnpm` commands.

**Current state:**

| Folder | Lockfile | Status |
|--------|----------|--------|
| `/` (extension) | `pnpm-lock.yaml` | already pnpm |
| `admin/` | `package-lock.json` | needs migration |
| `backend/` | `package-lock.json` | needs migration |

**Why pnpm workspace:** A workspace lockfile removes duplication, speeds CI installs via the content-addressable store, and prevents accidental cross-package version drift. All three packages share TypeScript and Vite — deduplication will be immediate.

**Tech Stack:** pnpm ≥ 9, Node ≥ 20

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `pnpm-workspace.yaml` | Declares workspace packages |
| Delete | `admin/package-lock.json` | Remove npm lockfile |
| Delete | `backend/package-lock.json` | Remove npm lockfile |
| Create | `.npmrc` | Enforce pnpm-only and hoist settings |
| Modify | `README.md` | Replace all `npm` commands with `pnpm` |
| Create | `admin/README.md` | Admin-specific dev instructions using pnpm |
| Create | `backend/README.md` | Backend-specific dev instructions using pnpm |

---

## Task 1: Root workspace scaffold

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`

**Steps:**

- [ ] Create `pnpm-workspace.yaml` declaring the three packages:

```yaml
packages:
  - "."
  - "admin"
  - "backend"
```

- [ ] Create `.npmrc` at the repo root:

```ini
# Enforce pnpm — prevents accidental npm/yarn installs
engine-strict=true
# Hoist peer-deps so Vite/Playwright/TypeScript resolve across packages
shamefully-hoist=false
public-hoist-pattern[]=*vitest*
public-hoist-pattern[]=@playwright*
```

- [ ] Add `engines` field to root `package.json` (alongside existing `scripts`):

```json
"engines": {
  "node": ">=20",
  "pnpm": ">=9"
}
```

Do the same for `admin/package.json` and `backend/package.json`.

---

## Task 2: Migrate admin/ to pnpm

**Files:**
- Delete: `admin/package-lock.json`
- Modify: `admin/package.json` (add `engines`)

**Steps:**

- [ ] Delete `admin/package-lock.json`.
- [ ] Delete `admin/node_modules/` if present (clean install will follow).
- [ ] Add `engines` to `admin/package.json`:

```json
"engines": {
  "node": ">=20",
  "pnpm": ">=9"
}
```

- [ ] Run `pnpm install` from the repo root to regenerate the workspace lockfile.
- [ ] Verify `admin` still builds: `pnpm --filter ciyo-admin run build`.

---

## Task 3: Migrate backend/ to pnpm

**Files:**
- Delete: `backend/package-lock.json`
- Modify: `backend/package.json` (add `engines`)

**Steps:**

- [ ] Delete `backend/package-lock.json`.
- [ ] Delete `backend/node_modules/` if present.
- [ ] Add `engines` to `backend/package.json`:

```json
"engines": {
  "node": ">=20",
  "pnpm": ">=9"
}
```

- [ ] Run `pnpm install` from the repo root (lockfile already updated in Task 2; this verifies backend deps resolve).
- [ ] Verify backend still builds: `pnpm --filter ciyo-backend run build`.

---

## Task 4: Update root README.md

**Files:**
- Modify: `README.md`

**Steps:**

- [ ] Replace the Prerequisites section:

```md
### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 — install via `npm install -g pnpm` or `corepack enable`
- [Docker](https://www.docker.com/) (for local Postgres)
- A [Clerk](https://clerk.com/) account
```

- [ ] Replace the "Install dependencies" section:

```md
### 1. Install dependencies

```sh
pnpm install
```

pnpm workspaces installs all three packages (extension, `admin/`, `backend/`) in one command.
```

- [ ] Replace every `npm run` and `cd X && npm ...` command in the README with pnpm equivalents:

| Old | New |
|-----|-----|
| `npm install` | `pnpm install` |
| `npm run db:setup` | `pnpm run db:setup` |
| `cd backend && npm run dev` | `pnpm --filter ciyo-backend run dev` |
| `cd admin && npm run dev` | `pnpm --filter ciyo-admin run dev` |
| `npm run dev` | `pnpm run dev` |
| `npm run build` | `pnpm run build` |
| `npm test` | `pnpm test` |
| `npm run build && npm run test:e2e` | `pnpm run build && pnpm run test:e2e` |
| `cd backend && npm run db:migrate` | `pnpm --filter ciyo-backend run db:migrate` |
| `cd backend && npm run seed:fintech` | `pnpm --filter ciyo-backend run seed:fintech` |
| `npm run check-db` | `pnpm run check-db` |
| `npm run check-db -- "..."` | `pnpm run check-db -- "..."` |

- [ ] Update the Useful Commands table to use pnpm equivalents.

---

## Task 5: Create admin/README.md

**Files:**
- Create: `admin/README.md`

```md
# ciyo-admin

React + Vite admin dashboard for the ciyo platform.

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9

## Install

From the **repo root** (recommended — shares the workspace lockfile):

```sh
pnpm install
```

Or just this package in isolation:

```sh
pnpm install
```

## Dev server

```sh
pnpm run dev
# http://localhost:5173
```

## Build

```sh
pnpm run build
```

## Tests

```sh
# Unit tests (Vitest)
pnpm test

# Watch mode
pnpm run test:watch
```

## Type check

```sh
pnpm run typecheck
```

## Notes

- The admin app expects the backend running on `http://localhost:3000`.
- Auth is handled by Clerk — set `VITE_CLERK_PUBLISHABLE_KEY` in `admin/.env.local`.
```

---

## Task 6: Create backend/README.md

**Files:**
- Create: `backend/README.md`

```md
# ciyo-backend

Fastify API server for the ciyo platform.

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Docker (for local Postgres)

## Install

From the **repo root** (recommended — shares the workspace lockfile):

```sh
pnpm install
```

## Environment setup

```sh
cp .env.example .env
```

Fill in `backend/.env`:

| Variable | Where to get it |
|---|---|
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys |
| `CLERK_WEBHOOK_SECRET` | Clerk Dashboard → Webhooks |
| `GROQ_API_KEY` | console.groq.com |

## Database

```sh
# Start Postgres container, migrate, seed demo data
pnpm run db:setup

# Run pending migrations only
pnpm run db:migrate

# Reseed fintech demo data
pnpm run seed:fintech
```

## Dev server

```sh
pnpm run dev
# http://localhost:3000
```

## Build

```sh
pnpm run build
```

## Start (production)

```sh
pnpm run start
```

## Tests

```sh
# Unit tests (Vitest)
pnpm test

# Watch mode
pnpm run test:watch

# E2E seed/teardown
pnpm run seed:e2e
pnpm run teardown:e2e
```

## Useful commands

```sh
# Verify DB rows (tenants + members)
pnpm run check-db

# Custom SQL query
pnpm run check-db -- "SELECT * FROM tenants;"
```
```

---

## Task 7: CI / tooling check

**Steps:**

- [ ] Search for any CI config files (`.github/workflows/*.yml`, `Dockerfile`, etc.) that call `npm install`, `npm ci`, or `yarn install`, and replace with `pnpm install --frozen-lockfile`.
- [ ] If a `Dockerfile` exists for the backend, replace `npm install` with:

```dockerfile
RUN npm install -g pnpm && pnpm install --frozen-lockfile
```

or use the official pnpm image/corepack pattern:

```dockerfile
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile
```

- [ ] If VS Code workspace settings reference npm scripts, update `.vscode/settings.json` to use pnpm.

---

## Verification checklist

After all tasks complete, run the full suite from the repo root:

```sh
pnpm install                         # clean install
pnpm run build                       # extension build
pnpm --filter ciyo-admin run build   # admin build
pnpm --filter ciyo-backend run build # backend build
pnpm test                            # extension unit tests
pnpm --filter ciyo-admin run test    # admin unit tests
pnpm --filter ciyo-backend run test  # backend unit tests
```

All commands must exit 0 before the migration is considered complete.
