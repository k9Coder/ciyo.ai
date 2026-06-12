#!/usr/bin/env bash
# agent-db-start.sh
#
# Spins up a throwaway Postgres container for one agent session.
# Runs migrations. Optionally seeds.
#
# Usage (source it — not run it — so exports reach the caller):
#   source scripts/agent-db-start.sh              # migrate only
#   source scripts/agent-db-start.sh seed:e2e     # migrate + seed:e2e
#   source scripts/agent-db-start.sh seed:fintech # migrate + seed:fintech
#
# After sourcing, DATABASE_URL is set and a cleanup trap is registered.
# Container is destroyed automatically on script exit (even on crash/Ctrl-C).

set -euo pipefail

SEED_CMD="${1:-}"
AGENT_LABEL="${AGENT_LABEL:-agent-$$}"
CONTAINER_NAME="ciyo-db-${AGENT_LABEL}"

# ── 1. Start postgres ──────────────────────────────────────────────────────────
echo "[db] starting container: $CONTAINER_NAME"

docker run -d \
  --name "$CONTAINER_NAME" \
  --publish 0:5432 \
  -e POSTGRES_DB=promptshield \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16-alpine \
  --quiet \
  > /dev/null

# ── 2. Extract the randomly-assigned host port (no collision possible) ─────────
DB_PORT=$(docker port "$CONTAINER_NAME" 5432 | cut -d: -f2)
export DATABASE_URL="postgresql://postgres:postgres@localhost:${DB_PORT}/promptshield"
echo "[db] DATABASE_URL=$DATABASE_URL"

# ── 3. Register cleanup — fires on EXIT even if the agent crashes ──────────────
# shellcheck disable=SC2064
trap "echo '[db] tearing down $CONTAINER_NAME'; docker rm -f '$CONTAINER_NAME' > /dev/null 2>&1 || true" EXIT

# ── 4. Wait for Postgres to be ready ──────────────────────────────────────────
echo "[db] waiting for postgres..."
for i in $(seq 1 30); do
  docker exec "$CONTAINER_NAME" pg_isready -U postgres -q 2>/dev/null && break
  sleep 1
done
echo "[db] postgres ready"

# ── 5. Run migrations ─────────────────────────────────────────────────────────
ROOT="$(git rev-parse --show-toplevel)"
echo "[db] running migrations..."
cd "$ROOT/backend"
pnpm migrate --silent 2>/dev/null || tsx src/db/migrate.ts
echo "[db] migrations done"

# ── 6. Optional seed ──────────────────────────────────────────────────────────
if [[ -n "$SEED_CMD" ]]; then
  echo "[db] seeding: $SEED_CMD"
  pnpm "$SEED_CMD"
  echo "[db] seed done"
fi

cd "$ROOT"
echo "[db] ready. DATABASE_URL is set."
