#!/usr/bin/env bash
# local-env.sh
#
# Lifecycle helper for the full local Docker stack defined in
# docker-compose.yml (postgres, backend, pretzel-console, mykka-web) — a
# fixed-port, isolated environment for manual/browser QA, as opposed to
# agent-stack-start.sh's random-port per-agent-session isolation.
#
# Usage:
#   scripts/local-env.sh up      # build + start, wait for health, print URLs
#   scripts/local-env.sh down    # stop and remove containers (keeps postgres_data)
#   scripts/local-env.sh urls    # print the URL table without touching the stack
#   scripts/local-env.sh status  # docker compose ps

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

print_urls() {
  echo ""
  echo "  backend           http://localhost:3000"
  echo "  pretzel-console   http://localhost:5173"
  echo "  mykka-web         http://localhost:3001"
  echo "  postgres          localhost:5432"
  echo ""
}

cmd="${1:-up}"

case "$cmd" in
  up)
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
