# ciyo.ai — Agent Orchestration Guide

> How to assign tasks to company agents, run them in parallel, and track progress.

---

## Mental model

Each company member is a **specialist agent with a fixed file scope**.
Each task becomes a **worktree → branch → PR**.
You review the PRs on GitHub. They never touch master directly.

```
You assign tasks
      ↓
Agents work in parallel (each in own worktree)
      ↓
Each opens a PR automatically
      ↓
You review on GitHub / VS Code
      ↓
You merge → GitHub auto-deletes branch
      ↓
Daily cleanup removes stale worktrees
```

---

## File ownership (who touches what)

| Person | Owns | Never touches |
|---|---|---|
| Arjun Mehta | `backend/src/`, `backend/tests/` | everything else |
| Omar Hassan | `pretzel/src/detection/`, `pretzel/tests/unit/detection/` | everything else |
| Yuki Tanaka | `pretzel/src/` (excl. detection), `pretzel/tests/unit/` (excl. detection) | everything else |
| Chloe Dubois | `pretzel-console/src/`, `pretzel-console/tests/` | everything else |
| Ryan Kowalski | `.github/workflows/`, `Dockerfile*`, `nginx.conf`, `docker-compose.yml` | everything else |
| Natasha Ivanova | `*/e2e/**` | everything else |
| Lena Hartmann | `*/tests/**` (unit only) | everything else |
| Priya Nair | `ciyo-web/` | everything else |
| Marcus Webb | `e2e/playwright.config.ts`, shared types, configs | feature code |

---

## Running multiple agents in parallel

In a single Claude Code message, spawn all agents at once.
Claude fires them simultaneously — wall time = slowest agent, not sum.

### Isolated full stack per agent

Every agent gets their own throwaway Postgres + backend server (+ optional console).
All on random OS-assigned ports. Zero collision between parallel agents.
Everything destroyed automatically when the agent exits.

```bash
# DB + backend (most common — backend tasks, API E2E)
export AGENT_LABEL="arjun-gdpr-erasure"
source scripts/agent-stack-start.sh seed:e2e
# DATABASE_URL → postgresql://…@localhost:54321/promptshield
# BACKEND_URL  → http://localhost:49823
# BACKEND_PID  → 18423

# Now run E2E tests against this private stack:
cd backend
PLAYWRIGHT_BASE_URL="$BACKEND_URL" pnpm test:e2e

# DB + backend + admin console (console E2E)
export AGENT_LABEL="chloe-modal-focus"
source scripts/agent-stack-start.sh seed:e2e --with-console
# CONSOLE_URL → http://localhost:52910
cd pretzel-console
PLAYWRIGHT_BASE_URL="$CONSOLE_URL" pnpm test:e2e

# DB only (unit tests that need a real DB but no HTTP server)
export AGENT_LABEL="lena-scan-limits"
source scripts/agent-stack-start.sh seed:e2e --no-backend

# EXIT (pass or crash) → kills backend, kills console, docker rm postgres
# Nothing left behind.
```

---

### Isolated DB per agent (recommended for any backend task)

Every agent that touches backend code or needs to run E2E tests gets its own throwaway Postgres.
No coordination. No shared state. Container destroyed when the agent exits.

```bash
# Agent includes this at the start of every backend task:
export AGENT_LABEL="arjun-gdpr-erasure"
source scripts/agent-db-start.sh seed:fintech

# DATABASE_URL is now set to a fresh isolated DB on a random port
# Cleanup trap registered — container destroyed on exit automatically

pnpm test          # runs against isolated DB
pnpm test:e2e      # same
# ... implement fixes ...
# EXIT → docker rm -f ciyo-db-arjun-gdpr-erasure
```

Agents that only touch frontend/extension/CI code: skip the DB step entirely.

---

### Example: three tasks at the same time

```
Spawn three agents:

Agent 1 — Arjun:
  Task: Add GDPR data erasure endpoint
  Branch: arjun/feat/gdpr-erasure
  Files: backend/src/members/router.ts, service.ts, tests

Agent 2 — Omar:
  Task: Add NHS number and MBI patterns
  Branch: omar/feat/medical-pii
  Files: pretzel/src/detection/layer1-patterns/pii.ts + tests

Agent 3 — Chloe:
  Task: Add data-testid to AuditLogRow action badge
  Branch: chloe/fix/audit-row-testid
  Files: pretzel-console/src/components (AuditLogRow only)
```

Each agent prompt must include:
1. Their identity + lens (from `company/staff/<name>.md`)
2. Exact files to touch
3. What to implement (from task description or COMPANY_IN_THE_LOOP finding)
4. Run `pnpm test` + `pnpm type-check`
5. Open PR via `gh pr create` with the template below
6. `isolation: "worktree"` + `run_in_background: true`

### PR template each agent uses

```bash
gh pr create \
  --title "fix(members): add GDPR data erasure endpoint" \
  --base master \
  --body "$(cat <<'EOF'
## Author
Arjun Mehta — Backend Engineer

## Task
Add `DELETE /v1/members/:id/data` endpoint for GDPR right-to-erasure compliance.

## Finding
[david-horowitz.md](../reviews/david-horowitz.md) — ISSUE #2: no erasure mechanism exists.

## Changes
- `backend/src/members/router.ts` — new DELETE route
- `backend/src/members/service.ts` — erasure logic (anonymize events, scans, delete user row)
- `backend/tests/members.test.ts` — erasure tests added

## Test results
263/263 passing

## Checklist
- [x] pnpm test passes
- [x] pnpm type-check passes
- [ ] Natasha: automated QA gate
- [ ] Marcus: code review
EOF
)"
```

---

## Tracking progress

### See all open PRs
```bash
gh pr list --state open
```
Output:
```
#42  fix(members): GDPR data erasure    arjun/feat/gdpr-erasure    OPEN
#43  fix(detection): NHS/MBI patterns   omar/feat/medical-pii       OPEN
#44  fix(console): audit row testid     chloe/fix/audit-row-testid  OPEN
```

### See all active worktrees
```bash
git worktree list
```
Output:
```
/repo                              abc1234  [master]
/repo/.claude/worktrees/agent-xxx  def5678  [arjun/feat/gdpr-erasure]
/repo/.claude/worktrees/agent-yyy  ghi9012  [omar/feat/medical-pii]
/repo/.claude/worktrees/agent-zzz  jkl3456  [chloe/fix/audit-row-testid]
```

### See what a specific agent changed
```bash
git diff master...arjun/feat/gdpr-erasure --stat
```

### See PR checks status
```bash
gh pr checks 42
```

---

## After you merge on GitHub

GitHub auto-deletes the branch (enable in repo Settings → General).

To clean up local worktrees:
```bash
# dry run — see what would be removed
bash scripts/cleanup-worktrees.sh

# actually remove
bash scripts/cleanup-worktrees.sh --apply
```

Or schedule it to run daily — ask Claude: `/schedule cleanup worktrees daily at 9am`.

---

## Rules for conflict-free parallel work

1. **One file = one owner.** Never assign the same file to two agents simultaneously.
2. **Scope check before spawning.** If two tasks touch overlapping files, run them sequentially.
3. **No cross-agent dependencies in the same wave.** If Agent B needs Agent A's output, A goes first, B goes after A's PR merges.
4. **Sequential merges.** Merge one PR, then the next rebases off updated master.

---

## Quick reference: who to call for what

| You need... | Call |
|---|---|
| New backend endpoint or DB change | Arjun Mehta |
| Detection pattern added/fixed | Omar Hassan |
| Extension behaviour changed | Yuki Tanaka |
| Admin console UI/UX | Chloe Dubois |
| CI/CD, Docker, infra | Ryan Kowalski |
| E2E test added/fixed | Natasha Ivanova |
| Unit test quality | Lena Hartmann |
| Marketing site copy/pages | Priya Nair |
| Shared types, config, architecture | Marcus Webb |
| Cross-domain task | Marcus Webb (he routes it) |
