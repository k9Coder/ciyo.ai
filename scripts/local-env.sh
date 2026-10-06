#!/usr/bin/env bash
# local-env.sh
#
# Lifecycle helper for the full local Docker stack defined in
# docker-compose.yml (postgres, backend, pretzel-console, mykka-web) — a
# fixed-port, isolated environment for manual/browser QA, as opposed to
# agent-stack-start.sh's random-port per-agent-session isolation.
#
# Usage:
#   scripts/local-env.sh up          # build + start, migrate, seed console test org, print URLs
#   scripts/local-env.sh up --no-seed  # same, but skip the console test-org seed
#   scripts/local-env.sh down        # stop and remove containers (keeps postgres_data)
#   scripts/local-env.sh urls        # print the URL table without touching the stack
#   scripts/local-env.sh status      # docker compose ps
#
# After `up`, pretzel-console at :5173 has a real logged-in-able test account
# (unless --no-seed): testuser@gmail.com / TESTuser — same identity e2e/ uses,
# sourced from pretzel-console/e2e/.env.e2e. Seeding TRUNCATES the local DB.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

print_urls() {
  echo ""
  echo "  backend           http://localhost:3000"
  echo "  pretzel-console   http://localhost:5173  (test login: testuser@gmail.com / TESTuser)"
  echo "  mykka-web         http://localhost:3001"
  echo "  postgres          localhost:5432"
  echo ""
}

cmd="${1:-up}"
shift || true

case "$cmd" in
  up)
    do_seed=true
    for arg in "$@"; do
      [[ "$arg" == "--no-seed" ]] && do_seed=false
    done

    echo "[local-env] building and starting stack..."
    docker compose up -d --build

    echo "[local-env] waiting for backend health..."
    for i in $(seq 1 60); do
      curl -sf http://localhost:3000/health > /dev/null 2>&1 && break
      sleep 1
      if [[ "$i" -eq 60 ]]; then
        echo "[local-env] backend did not become healthy in time — check: docker compose logs backend" >&2
        exit 1
      fi
    done

    echo "[local-env] running DB migrations..."
    ( cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/promptshield" pnpm db:migrate )

    if $do_seed; then
      echo "[local-env] seeding console test org (truncates the local DB)..."
      ( cd backend && set -a && source ../pretzel-console/e2e/.env.e2e && set +a \
        && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/promptshield" pnpm seed:e2e )
    fi

    echo "[local-env] ready."
    print_urls
    ;;

  down)
    echo "[local-env] stopping stack..."
    docker compose down
    echo "[local-env] done. postgres_data volume kept — use 'docker compose down -v' to also wipe it."
    ;;

  urls)
    print_urls
    ;;

  status)
    docker compose ps
    ;;

  *)
    echo "Usage: $0 {up|down|urls|status}" >&2
    exit 1
    ;;
esac
