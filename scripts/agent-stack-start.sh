#!/usr/bin/env bash
# agent-stack-start.sh
#
# Spins up a fully isolated test stack for one agent:
#   - throwaway Postgres on a random host port
#   - backend server on a random host port  (optional: --no-backend)
#   - admin console on a random host port   (optional: --with-console)
#
# Usage (source it so exports reach the caller):
#
#   source scripts/agent-stack-start.sh                    # db + backend
#   source scripts/agent-stack-start.sh seed:e2e           # db (seeded) + backend
#   source scripts/agent-stack-start.sh seed:fintech       # db (fintech demo) + backend
#   source scripts/agent-stack-start.sh seed:e2e --with-console  # db + backend + console
#   source scripts/agent-stack-start.sh "" --no-backend    # db only
#
# After sourcing, these are exported and ready:
#   DATABASE_URL        postgresql://…@localhost:<db-port>/promptshield
#   BACKEND_URL         http://localhost:<backend-port>
#   CONSOLE_URL         http://localhost:<console-port>   (if --with-console)
#   BACKEND_PID         process ID of the backend server
#   CONSOLE_PID         process ID of the console dev server (if started)
#
# Cleanup is automatic on EXIT (pass or crash — the trap fires either way).

set -euo pipefail

SEED_CMD="${1:-}"
shift || true

WITH_CONSOLE=false
NO_BACKEND=false
for arg in "$@"; do
  [[ "$arg" == "--with-console" ]] && WITH_CONSOLE=true
  [[ "$arg" == "--no-backend"   ]] && NO_BACKEND=true
done

AGENT_LABEL="${AGENT_LABEL:-agent-$$}"
ROOT="$(git rev-parse --show-toplevel)"

# ── Helper: grab a free OS port ───────────────────────────────────────────────
free_port() {
  python3 -c "
import socket
s = socket.socket()
s.bind(('', 0))
print(s.getsockname()[1])
s.close()
"
}

# ── 1. Postgres ───────────────────────────────────────────────────────────────
CONTAINER_NAME="mykka-db-${AGENT_LABEL}"
echo "[stack] starting postgres: $CONTAINER_NAME"

docker run -d \
  --name "$CONTAINER_NAME" \
  --publish 0:5432 \
  -e POSTGRES_DB=promptshield \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16-alpine \
  --quiet > /dev/null

DB_PORT=$(docker port "$CONTAINER_NAME" 5432 | cut -d: -f2)
export DATABASE_URL="postgresql://postgres:postgres@localhost:${DB_PORT}/promptshield"
echo "[stack] db on port $DB_PORT"

# ── 2. Wait for postgres ───────────────────────────────────────────────────────
for i in $(seq 1 30); do
  docker exec "$CONTAINER_NAME" pg_isready -U postgres -q 2>/dev/null && break
  sleep 1
done

# ── 3. Migrate ────────────────────────────────────────────────────────────────
echo "[stack] migrating..."
cd "$ROOT/backend"
pnpm migrate --silent 2>/dev/null || DATABASE_URL="$DATABASE_URL" tsx src/db/migrate.ts
echo "[stack] migrations done"

# ── 4. Seed ───────────────────────────────────────────────────────────────────
if [[ -n "$SEED_CMD" ]]; then
  echo "[stack] seeding: $SEED_CMD"
  # seed-e2e.ts needs E2E_CLERK_USER_ID/EMAIL (only in e2e/.env.e2e, not
  # backend/.env) to create the seeded users row — without them clerkId/email
  # insert as null and the NOT NULL constraint on users.email fails.
  DATABASE_URL="$DATABASE_URL" \
    E2E_CLERK_USER_ID="$(grep -m1 '^E2E_CLERK_USER_ID=' "$ROOT/e2e/.env.e2e" | cut -d= -f2-)" \
    E2E_CLERK_USER_EMAIL="$(grep -m1 '^E2E_CLERK_USER_EMAIL=' "$ROOT/e2e/.env.e2e" | cut -d= -f2-)" \
    pnpm "$SEED_CMD"
  echo "[stack] seed done"
fi

# ── 5. Backend server ─────────────────────────────────────────────────────────
# Console port is reserved *before* the backend starts (rather than in step 6)
# so the backend's CORS allowlist can be seeded with its real origin —
# without this, the backend falls back to its hardcoded production origin
# and every authenticated console call gets silently CORS-blocked.
CONSOLE_PORT=""
export CONSOLE_URL=""
if $WITH_CONSOLE; then
  CONSOLE_PORT=$(free_port)
  export CONSOLE_URL="http://localhost:${CONSOLE_PORT}"
fi

BACKEND_PID=""
if ! $NO_BACKEND; then
  BACKEND_PORT=$(free_port)
  export BACKEND_URL="http://localhost:${BACKEND_PORT}"
  export PORT="$BACKEND_PORT"

  echo "[stack] starting backend on port $BACKEND_PORT..."
  cd "$ROOT/backend"
  # Without this, /auth/desktop/authorize (the desktop app's OAuth redirect
  # target) falls back to backend/.env's PRETZEL_CONSOLE_URL — the user's own
  # real local dev console (localhost:5173) — instead of this stack's own
  # isolated one, silently sending desktop-auth flows to the wrong
  # database/session entirely even with --with-console.
  PRETZEL_CONSOLE_URL_OVERRIDE=""
  [[ -n "$CONSOLE_URL" ]] && PRETZEL_CONSOLE_URL_OVERRIDE="$CONSOLE_URL"
  DATABASE_URL="$DATABASE_URL" PORT="$BACKEND_PORT" CORS_ORIGIN="$CONSOLE_URL" \
    ${PRETZEL_CONSOLE_URL_OVERRIDE:+PRETZEL_CONSOLE_URL="$PRETZEL_CONSOLE_URL_OVERRIDE"} pnpm dev > /tmp/backend-${AGENT_LABEL}.log 2>&1 &
  export BACKEND_PID=$!

  # wait until health endpoint responds (max 30s)
  for i in $(seq 1 30); do
    curl -sf "${BACKEND_URL}/health" > /dev/null 2>&1 && break
    sleep 1
  done
  echo "[stack] backend ready at $BACKEND_URL"
fi

# ── 6. Console dev server (optional) ─────────────────────────────────────────
CONSOLE_PID=""
if $WITH_CONSOLE; then
  echo "[stack] starting console on port $CONSOLE_PORT..."
  cd "$ROOT/pretzel-console"
  VITE_API_URL="$BACKEND_URL" pnpm dev --port "$CONSOLE_PORT" > /tmp/console-${AGENT_LABEL}.log 2>&1 &
  export CONSOLE_PID=$!

  for i in $(seq 1 20); do
    curl -sf "${CONSOLE_URL}" > /dev/null 2>&1 && break
    sleep 1
  done
  echo "[stack] console ready at $CONSOLE_URL"
fi

# ── 7. Cleanup trap — fires on EXIT no matter what ───────────────────────────
_stack_cleanup() {
  echo "[stack] tearing down..."
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "$CONSOLE_PID" ]] && kill "$CONSOLE_PID" 2>/dev/null || true
  docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1 || true
  echo "[stack] done."
}
trap _stack_cleanup EXIT

cd "$ROOT"
echo ""
echo "[stack] ✓ isolated stack ready"
echo "         DATABASE_URL = $DATABASE_URL"
[[ -n "$BACKEND_PID"  ]] && echo "         BACKEND_URL  = $BACKEND_URL  (pid $BACKEND_PID)"
[[ -n "$CONSOLE_PID"  ]] && echo "         CONSOLE_URL  = $CONSOLE_URL  (pid $CONSOLE_PID)"
echo ""
