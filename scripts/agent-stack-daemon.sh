#!/usr/bin/env bash
# agent-stack-daemon.sh
#
# Detached fork of agent-stack-start.sh: spins up the same isolated
# Postgres + backend (+ console + web) stack, but instead of relying on an
# `EXIT` trap in the calling shell (which only works when the same shell
# stays alive for the whole test run), it detaches every child process with
# nohup+disown and writes resolved state to disk. Use this when the stack
# needs to outlive the shell/tool-call that started it — e.g. a background
# agent picks up the URLs later and scripts/agent-stack-stop.sh tears it
# down explicitly once that agent finishes.
#
# Usage:
#
#   scripts/agent-stack-daemon.sh                              # db + backend
#   scripts/agent-stack-daemon.sh seed:e2e --label qa-backend-1
#   scripts/agent-stack-daemon.sh seed:e2e --with-console --label qa-console-1
#   scripts/agent-stack-daemon.sh seed:e2e --with-web --label qa-web-1
#   scripts/agent-stack-daemon.sh "" --no-backend --label qa-db-only-1
#
# Writes:
#   .gstack/agent-stacks/<label>/env    source-able DATABASE_URL/BACKEND_URL/
#                                        CONSOLE_URL/WEB_URL
#   .gstack/agent-stacks/<label>/pids   one entry per line, consumed by
#                                        agent-stack-stop.sh:
#                                          container:<name>
#                                          pid:<pid>
#
# Also prints the URL table to stdout, same as agent-stack-start.sh.

set -euo pipefail

SEED_CMD="${1:-}"
shift || true

WITH_CONSOLE=false
WITH_WEB=false
NO_BACKEND=false
LABEL=""
for arg in "$@"; do
  case "$arg" in
    --with-console) WITH_CONSOLE=true ;;
    --with-web) WITH_WEB=true ;;
    --no-backend) NO_BACKEND=true ;;
    --label) LABEL_NEXT=1 ;;
    *)
      if [[ "${LABEL_NEXT:-}" == "1" ]]; then
        LABEL="$arg"
        LABEL_NEXT=0
      fi
      ;;
  esac
done

AGENT_LABEL="${LABEL:-${AGENT_LABEL:-agent-$$}}"
ROOT="$(git rev-parse --show-toplevel)"
STATE_DIR="$ROOT/.gstack/agent-stacks/$AGENT_LABEL"

if [[ -d "$STATE_DIR" ]]; then
  echo "[stack-daemon] state dir already exists for label '$AGENT_LABEL' — pick a different --label or run agent-stack-stop.sh first: $STATE_DIR" >&2
  exit 1
fi
mkdir -p "$STATE_DIR"
PIDS_FILE="$STATE_DIR/pids"
ENV_FILE="$STATE_DIR/env"
: > "$PIDS_FILE"
: > "$ENV_FILE"

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
echo "[stack-daemon] starting postgres: $CONTAINER_NAME"

docker run -d \
  --name "$CONTAINER_NAME" \
  --publish 0:5432 \
  -e POSTGRES_DB=promptshield \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16-alpine > /dev/null

echo "container:$CONTAINER_NAME" >> "$PIDS_FILE"

DB_PORT=$(docker port "$CONTAINER_NAME" 5432 | cut -d: -f2)
DATABASE_URL="postgresql://postgres:postgres@localhost:${DB_PORT}/promptshield"
echo "export DATABASE_URL=\"$DATABASE_URL\"" >> "$ENV_FILE"
echo "[stack-daemon] db on port $DB_PORT"

# ── 2. Wait for postgres ───────────────────────────────────────────────────────
for i in $(seq 1 30); do
  docker exec "$CONTAINER_NAME" pg_isready -U postgres -q 2>/dev/null && break
  sleep 1
done
# pg_isready above checks readiness *inside* the container; the host-mapped
# port can lag a moment behind that. Confirm the host side actually accepts
# connections before handing off to migrate — avoids an ECONNREFUSED race.
for i in $(seq 1 15); do
  (exec 3<>"/dev/tcp/localhost/$DB_PORT") 2>/dev/null && exec 3<&- && break
  sleep 1
done

# ── 3. Migrate ────────────────────────────────────────────────────────────────
echo "[stack-daemon] migrating..."
cd "$ROOT/backend"
DATABASE_URL="$DATABASE_URL" pnpm db:migrate
echo "[stack-daemon] migrations done"

# ── 4. Seed ───────────────────────────────────────────────────────────────────
if [[ -n "$SEED_CMD" ]]; then
  echo "[stack-daemon] seeding: $SEED_CMD"
  # seed-e2e.ts needs E2E_CLERK_USER_ID/EMAIL (only in e2e/.env.e2e, not
  # backend/.env) to create the seeded users row — without them clerkId/email
  # insert as null and the NOT NULL constraint on users.email fails.
  DATABASE_URL="$DATABASE_URL" \
    E2E_CLERK_USER_ID="$(grep -m1 '^E2E_CLERK_USER_ID=' "$ROOT/e2e/.env.e2e" | cut -d= -f2-)" \
    E2E_CLERK_USER_EMAIL="$(grep -m1 '^E2E_CLERK_USER_EMAIL=' "$ROOT/e2e/.env.e2e" | cut -d= -f2-)" \
    pnpm "$SEED_CMD"
  echo "[stack-daemon] seed done"
fi

# ── 5. Backend server (detached) ──────────────────────────────────────────────
# Console/web ports are reserved *before* the backend starts (rather than
# when their own dev servers start in steps 6/7) so the backend's CORS
# allowlist can be seeded with their real origins from the first request —
# without this, the backend falls back to its hardcoded production origin
# and every authenticated console/web call gets silently CORS-blocked.
# mykka-web's own "Sign in" link always points at NEXT_PUBLIC_APP_URL (the
# console origin) — without a console instance to point it at, that env var
# is left unset and mykka-web/lib/env.ts falls back to its production
# default (https://app.mykka.ai), so any sign-in click from an isolated
# --with-web run silently escapes the sandbox onto real production. Force
# console up alongside web so there's always an isolated target to redirect
# into.
if $WITH_WEB; then
  WITH_CONSOLE=true
fi

CONSOLE_PORT=""
CONSOLE_URL=""
if $WITH_CONSOLE; then
  CONSOLE_PORT=$(free_port)
  CONSOLE_URL="http://localhost:${CONSOLE_PORT}"
fi
WEB_PORT=""
WEB_URL=""
if $WITH_WEB; then
  WEB_PORT=$(free_port)
  WEB_URL="http://localhost:${WEB_PORT}"
fi
CORS_ORIGIN=""
[[ -n "$CONSOLE_URL" ]] && CORS_ORIGIN="$CONSOLE_URL"
[[ -n "$WEB_URL" ]] && CORS_ORIGIN="${CORS_ORIGIN:+$CORS_ORIGIN,}$WEB_URL"

BACKEND_URL=""
if ! $NO_BACKEND; then
  BACKEND_PORT=$(free_port)
  BACKEND_URL="http://localhost:${BACKEND_PORT}"

  echo "[stack-daemon] starting backend on port $BACKEND_PORT..."
  cd "$ROOT/backend"
  # Without this, /auth/desktop/authorize (the desktop app's OAuth redirect
  # target) falls back to backend/.env's PRETZEL_CONSOLE_URL — the user's own
  # real local dev console (localhost:5173) — instead of this stack's own
  # isolated one, silently sending desktop-auth flows to the wrong
  # database/session entirely even with --with-console.
  PRETZEL_CONSOLE_URL_OVERRIDE=""
  [[ -n "$CONSOLE_URL" ]] && PRETZEL_CONSOLE_URL_OVERRIDE="$CONSOLE_URL"
  # The backend's own service layer (policy compiler, etc.) calls its
  # /internal/* endpoints via INTERNAL_API_URL, which defaults to
  # localhost:3000 — the developer's real dev backend, NOT this isolated one.
  # Without this override, compilePolicy() reads subjects/rules from the wrong
  # server and publishes an empty policy, so nothing an isolated stack
  # publishes ever reaches its own clients. Point it back at this backend.
  nohup env DATABASE_URL="$DATABASE_URL" PORT="$BACKEND_PORT" CORS_ORIGIN="$CORS_ORIGIN" \
    INTERNAL_API_URL="$BACKEND_URL" \
    ${PRETZEL_CONSOLE_URL_OVERRIDE:+PRETZEL_CONSOLE_URL="$PRETZEL_CONSOLE_URL_OVERRIDE"} pnpm dev \
    > "/tmp/backend-${AGENT_LABEL}.log" 2>&1 &
  BACKEND_PID=$!
  disown "$BACKEND_PID"
  echo "pid:$BACKEND_PID" >> "$PIDS_FILE"

  for i in $(seq 1 30); do
    curl -sf "${BACKEND_URL}/health" > /dev/null 2>&1 && break
    sleep 1
    if [[ "$i" -eq 30 ]]; then
      echo "[stack-daemon] backend did not become healthy in time — check: /tmp/backend-${AGENT_LABEL}.log" >&2
    fi
  done
  echo "export BACKEND_URL=\"$BACKEND_URL\"" >> "$ENV_FILE"
  echo "[stack-daemon] backend ready at $BACKEND_URL"
fi

# ── 6. Console dev server (optional, detached) ────────────────────────────────
if $WITH_CONSOLE; then
  echo "[stack-daemon] starting console on port $CONSOLE_PORT..."
  cd "$ROOT/pretzel-console"
  # NOTE: console code reads VITE_API_BASE (not VITE_API_URL, which
  # agent-stack-start.sh sets and which the console ignores — see
  # scripts/README.md "Current Isolation Limitations"). Fixed here.
  nohup env VITE_API_BASE="$BACKEND_URL" pnpm dev --port "$CONSOLE_PORT" \
    > "/tmp/console-${AGENT_LABEL}.log" 2>&1 &
  CONSOLE_PID=$!
  disown "$CONSOLE_PID"
  echo "pid:$CONSOLE_PID" >> "$PIDS_FILE"

  for i in $(seq 1 20); do
    curl -sf "${CONSOLE_URL}" > /dev/null 2>&1 && break
    sleep 1
  done
  echo "export CONSOLE_URL=\"$CONSOLE_URL\"" >> "$ENV_FILE"
  echo "[stack-daemon] console ready at $CONSOLE_URL"
fi

# ── 7. mykka-web dev server (optional, detached) ──────────────────────────────
if $WITH_WEB; then
  echo "[stack-daemon] starting mykka-web on port $WEB_PORT..."
  cd "$ROOT/mykka-web"
  # Bypass the package.json "dev" script (hardcoded to -p 4000) so each
  # isolated run gets its own port. NEXT_PUBLIC_APP_URL points sign-in/
  # onboarding links at this run's own isolated console (started above)
  # instead of falling back to production — see the WITH_CONSOLE note near
  # the port-reservation block.
  nohup env NEXT_PUBLIC_API_BASE="$BACKEND_URL" NEXT_PUBLIC_APP_URL="$CONSOLE_URL" pnpm exec next dev -p "$WEB_PORT" \
    > "/tmp/web-${AGENT_LABEL}.log" 2>&1 &
  WEB_PID=$!
  disown "$WEB_PID"
  echo "pid:$WEB_PID" >> "$PIDS_FILE"

  for i in $(seq 1 30); do
    curl -sf "${WEB_URL}" > /dev/null 2>&1 && break
    sleep 1
  done
  echo "export WEB_URL=\"$WEB_URL\"" >> "$ENV_FILE"
  echo "[stack-daemon] mykka-web ready at $WEB_URL"
fi

cd "$ROOT"
echo ""
echo "[stack-daemon] ready — state: $STATE_DIR"
echo "         DATABASE_URL = $DATABASE_URL"
[[ -n "$BACKEND_URL" ]] && echo "         BACKEND_URL  = $BACKEND_URL"
[[ -n "$CONSOLE_URL"  ]] && echo "         CONSOLE_URL  = $CONSOLE_URL"
[[ -n "$WEB_URL"      ]] && echo "         WEB_URL      = $WEB_URL"
echo ""
echo "Tear down with: scripts/agent-stack-stop.sh $AGENT_LABEL"
