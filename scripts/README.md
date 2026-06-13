---
status: current
owner: engineering
verified_at: 2026-06-13
sources:
  - scripts/set-env.mjs
  - scripts/agent-db-start.sh
  - scripts/agent-stack-start.sh
  - scripts/cleanup-worktrees.sh
  - package.json
  - backend/package.json
  - pretzel-console/src/lib/api.ts
---

# Repository Scripts

These scripts switch checked-out environment files, create isolated local
services for agent sessions, and clean up stale Git worktrees. Run them from a
Git checkout of this repository. The shell scripts require Bash even when the
checkout is on Windows.

## Environment Switching

`set-env.mjs` accepts only `staging` or `prod` and resolves paths relative to
the current working directory. Run it from the repository root:

```powershell
pnpm set-env:staging
pnpm set-env:prod
```

Equivalent direct commands:

```powershell
node scripts/set-env.mjs staging
node scripts/set-env.mjs prod
```

The script overwrites these local files when the source exists:

| Source | Destination |
|---|---|
| `backend/.env.<environment>` | `backend/.env` |
| `ciyo-web/.env.<environment>` | `ciyo-web/.env.local` |

Missing source files produce a warning and are skipped, so a run can leave a
partially switched environment. The script does not copy files for the Vite
packages. Use their mode-specific commands instead:

```powershell
pnpm --dir pretzel build:staging
pnpm --dir pretzel build:prod
pnpm --dir pretzel-console dev:staging
pnpm --dir pretzel-console dev:prod
```

## Isolated Agent Database

`agent-db-start.sh` creates one disposable `postgres:16-alpine` container,
publishes PostgreSQL on a random host port, exports `DATABASE_URL`, runs backend
migrations, and optionally runs one backend seed command.

Source the script so `DATABASE_URL` and its `EXIT` cleanup trap remain in the
calling shell:

```bash
source scripts/agent-db-start.sh
source scripts/agent-db-start.sh seed:e2e
source scripts/agent-db-start.sh seed:fintech
```

Requirements:

- Bash, Docker, Git, pnpm, and backend dependencies.
- A unique `AGENT_LABEL` when multiple sessions could otherwise share the same
  process ID namespace. The container name is `ciyo-db-$AGENT_LABEL`; the
  default label is `agent-$$`.
- Any environment variables required by the selected seed. In particular,
  `seed:e2e` depends on the E2E Clerk identity variables.

The cleanup trap removes the database container when the calling shell exits.
Sourcing this script replaces any existing `EXIT` trap in that shell.

## Isolated Agent Stack

`agent-stack-start.sh` creates a disposable database and, by default, starts a
backend dev server on a random port. It can also start the admin console.

```bash
source scripts/agent-stack-start.sh
source scripts/agent-stack-start.sh seed:e2e
source scripts/agent-stack-start.sh seed:fintech
source scripts/agent-stack-start.sh seed:e2e --with-console
source scripts/agent-stack-start.sh "" --no-backend
```

It exports:

| Variable | When set |
|---|---|
| `DATABASE_URL` | Always |
| `BACKEND_URL`, `PORT`, `BACKEND_PID` | Unless `--no-backend` is used |
| `CONSOLE_URL`, `CONSOLE_PID` | When `--with-console` is used |

The script requires Bash, Docker, Git, pnpm, Python 3, `curl`, and installed
backend dependencies. Starting the console also requires installed
`pretzel-console` dependencies.

Service logs are written to `/tmp/backend-$AGENT_LABEL.log` and
`/tmp/console-$AGENT_LABEL.log`. The `EXIT` trap stops the child processes and
removes the database container when the calling shell exits. As with the
database-only script, sourcing it replaces an existing `EXIT` trap.

The exported names do not directly match the cross-package Playwright runner.
To use an isolated stack with `e2e/playwright.config.ts`, set the aliases before
running Playwright:

```bash
export E2E_DATABASE_URL="$DATABASE_URL"
export E2E_BACKEND_URL="$BACKEND_URL"
export E2E_ADMIN_URL="$CONSOLE_URL" # only when --with-console was used
cd e2e
pnpm test:e2e
```

The Playwright global setup reseeds `E2E_DATABASE_URL`, and global teardown
removes most seeded test data. A prior `seed:e2e` argument is therefore
unnecessary for the normal full runner.

### Current Isolation Limitations

- The stack script starts the console with `VITE_API_URL`, but the console code
  reads `VITE_API_BASE`. Unless another environment source sets
  `VITE_API_BASE`, the console falls back to `http://localhost:3000` instead of
  the isolated backend's random port.
- The database and service readiness loops continue after their timeout rather
  than failing explicitly. A later migration or test command is what exposes a
  startup failure.
- `BACKEND_URL` and `CONSOLE_URL` are not the `E2E_BACKEND_URL` and
  `E2E_ADMIN_URL` names consumed by the cross-package Playwright runner.

These are descriptions of the current scripts, not fixes.

## Worktree Cleanup

`cleanup-worktrees.sh` finds linked worktrees whose local branch no longer
exists on `origin`. It always fetches and prunes remote refs first.

Preview removals:

```bash
bash scripts/cleanup-worktrees.sh
```

Apply removals:

```bash
bash scripts/cleanup-worktrees.sh --apply
```

Apply mode force-removes matching linked worktrees, deletes their local
branches, and prunes worktree metadata. It skips the primary worktree and any
worktree whose branch still exists on `origin`. Because detection depends on
remote branch existence, do not use `--apply` for intentionally retained local
worktrees after deleting their remote branches.
