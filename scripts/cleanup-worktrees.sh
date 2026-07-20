#!/usr/bin/env bash
# cleanup-worktrees.sh
# Removes local worktrees whose remote branches have been deleted (merged PRs).
# Run manually or schedule daily via Claude Code /schedule.
#
# Usage:
#   bash scripts/cleanup-worktrees.sh          # dry run (shows what would be removed)
#   bash scripts/cleanup-worktrees.sh --apply  # actually removes them

set -euo pipefail

DRY_RUN=true
if [[ "${1:-}" == "--apply" ]]; then
  DRY_RUN=false
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo ""
echo "=== mykka.ai worktree cleanup ==="
echo ""

# Step 1: Fetch + prune remote refs so we know which branches are gone
echo "[1/3] Fetching and pruning remote refs..."
git fetch --prune --quiet
echo "      Done."
echo ""

# Step 2: Find worktrees whose branch no longer exists on origin
echo "[2/3] Scanning worktrees..."
echo ""

CLEANED=0
SKIPPED=0

while IFS= read -r line; do
  [[ "$line" =~ ^worktree\ (.+)$ ]] && WORKTREE_PATH="${BASH_REMATCH[1]}" && BRANCH="" && continue
  [[ "$line" =~ ^branch\ refs/heads/(.+)$ ]] && BRANCH="${BASH_REMATCH[1]}" && continue
  [[ -z "$line" ]] || continue

  # skip the main worktree (no branch variable set yet or it's the primary)
  [[ -z "${BRANCH:-}" ]] && continue
  [[ "$WORKTREE_PATH" == "$ROOT" ]] && BRANCH="" && continue

  # check if remote branch still exists
  if ! git ls-remote --exit-code --heads origin "$BRANCH" &>/dev/null; then
    if $DRY_RUN; then
      echo "  [DRY RUN] would remove: $BRANCH"
      echo "            path: $WORKTREE_PATH"
    else
      echo "  removing: $BRANCH"
      git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
      git branch -D "$BRANCH" 2>/dev/null || true
      echo "  removed."
    fi
    ((CLEANED++)) || true
  else
    echo "  keeping:  $BRANCH (branch still open on origin)"
    ((SKIPPED++)) || true
  fi
  BRANCH=""

done < <(git worktree list --porcelain; echo "")

echo ""
echo "[3/3] Summary:"
if $DRY_RUN; then
  echo "  $CLEANED worktree(s) would be removed  |  $SKIPPED kept"
  echo ""
  echo "  Run with --apply to actually remove them:"
  echo "  bash scripts/cleanup-worktrees.sh --apply"
else
  echo "  $CLEANED worktree(s) removed  |  $SKIPPED kept"
  # final prune pass for anything git worktree remove missed
  git worktree prune --verbose 2>/dev/null || true
fi
echo ""
