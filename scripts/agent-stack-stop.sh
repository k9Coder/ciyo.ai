#!/usr/bin/env bash
# agent-stack-stop.sh
#
# Explicit teardown for a stack started with agent-stack-daemon.sh. That
# script detaches its child processes instead of relying on a shell EXIT
# trap, so nothing stops the stack automatically — this is the other half.
#
# Usage:
#   scripts/agent-stack-stop.sh <label>

set -uo pipefail

LABEL="${1:-}"
if [[ -z "$LABEL" ]]; then
  echo "Usage: $0 <label>" >&2
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
STATE_DIR="$ROOT/.gstack/agent-stacks/$LABEL"
PIDS_FILE="$STATE_DIR/pids"

if [[ ! -f "$PIDS_FILE" ]]; then
  echo "[stack-stop] no state found for label '$LABEL' (expected $PIDS_FILE)" >&2
  exit 1
fi

echo "[stack-stop] tearing down '$LABEL'..."

while IFS= read -r line; do
  case "$line" in
    pid:*)
      pid="${line#pid:}"
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        sleep 1
        kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
        echo "[stack-stop] stopped pid $pid"
      fi
      ;;
    container:*)
      name="${line#container:}"
      docker rm -f "$name" > /dev/null 2>&1 || true
      echo "[stack-stop] removed container $name"
      ;;
  esac
done < "$PIDS_FILE"

rm -rf "$STATE_DIR"
echo "[stack-stop] done."
