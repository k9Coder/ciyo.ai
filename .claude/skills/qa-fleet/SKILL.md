---
name: qa-fleet
description: Orchestrate report-only, timeboxed exploratory QA across all (or selected) products — backend, pretzel-console, mykka-web, pretzel-desktop, pretzel extension — each against its own isolated backend+DB, in parallel, producing per-product Jira-paste-ready bug tickets.
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
  - Skill
  - Agent
triggers:
  - qa fleet
  - qa everything
  - qa all products
  - orchestrate qa
---

# /qa-fleet: isolated per-product QA orchestrator

Spins up one throwaway backend+DB per requested product (so no product's test
data or crashes can bleed into another's), points that product at it, and
runs a short timeboxed exploratory pass — report-only, never fixes anything —
producing a QA report plus a `jira-tickets.md` per product. This is the
"5 manual QA testers, each handed their own clean environment" version of
`/qa-env`; it does not replace `/qa`'s fix-loop or `/qa-env`'s single-target
launcher, it composes on top of them.

## Parse the request

`/qa-fleet [product ...] [--timebox <duration>] [--sequential]`

- Products: any of `backend`, `console`, `web`, `desktop`, `extension`.
  Default: all five. Accept plural/alias phrasing ("everything", "the whole
  fleet", "all products") as "all five."
- `--timebox <duration>`: default `3m`. Passed straight through to each
  product's `/qa-only --timebox <duration>` invocation (see "Timebox mode" in
  `qa-only`'s SKILL.md — it's a stopping condition, not a depth setting: the
  agent still picks what's worth probing itself).
- `--sequential`: run products one at a time instead of in parallel. Default
  is parallel — each product gets its own isolated Postgres container and
  backend process, so there's no shared-state reason to serialize. Use
  `--sequential` when the machine is resource-constrained (N Postgres
  containers + N backend processes running at once is the real cost) or when
  debugging the orchestrator itself.

## Step 0: Pre-flight

```bash
_ROOT=$(git rev-parse --show-toplevel)
mkdir -p "$_ROOT/.gstack/agent-stacks/.locks"
RUN_ID=$(date +%Y%m%d-%H%M%S)
OUT_DIR="$_ROOT/.gstack/qa-reports/fleet-$RUN_ID"
mkdir -p "$OUT_DIR"
```

**Desktop/extension exclusivity lock:** both share a single build output dir
(`pretzel-desktop/dist-electron/`, `pretzel/dist/`) that this run's rebuild
step overwrites — a second concurrent fleet run touching the same product
would clobber it mid-QA. Before including `desktop` or `extension` in this
run:

```bash
_LOCK="$_ROOT/.gstack/agent-stacks/.locks/<desktop|extension>"
if [ -f "$_LOCK" ]; then
  _AGE_MIN=$(( ( $(date +%s) - $(date -r "$_LOCK" +%s 2>/dev/null || echo 0) ) / 60 ))
  if [ "$_AGE_MIN" -lt 20 ]; then
    echo "LOCKED: another fleet run ($(cat "$_LOCK")) started ${_AGE_MIN}m ago"
  else
    echo "STALE: removing stale lock from $(cat "$_LOCK")"
    rm -f "$_LOCK"
  fi
fi
```

If `LOCKED`: tell the user another run owns that product right now and skip
it (don't queue — keep this simple). If `STALE` (>20 min old — longer than a
build + timebox + teardown should ever take): remove and proceed. Otherwise
write `echo "$RUN_ID" > "$_LOCK"` before starting that product's build step,
and remove the lock file in that product's teardown (Step 4).

## Step 1: Per-product isolated stack

For each requested product, in parallel (or one at a time under
`--sequential`):

| Product | `agent-stack-daemon.sh` flags | Resolved target |
|---|---|---|
| `backend` | *(none)* | `$BACKEND_URL` |
| `console` | `--with-console` | `$CONSOLE_URL` |
| `web` | `--with-web` | `$WEB_URL` |
| `desktop` | *(none — backend only)* | qa-bridge (native app) |
| `extension` | *(none — backend only)* | qa-bridge (loaded extension) |

```bash
AGENT_LABEL="qa-fleet-<product>-$RUN_ID"
"$_ROOT/scripts/agent-stack-daemon.sh" seed:e2e <flags-for-product> --label "$AGENT_LABEL"
source "$_ROOT/.gstack/agent-stacks/$AGENT_LABEL/env"
```

Use `seed:e2e` so console/web auth (`testuser@gmail.com` / `TESTuser`, same
identity `qa-env`'s local mode documents) works for products that need it.

**Desktop only**, after the stack is up and `$BACKEND_URL` is known:
```bash
( cd "$_ROOT/pretzel-desktop" && PRETZEL_API_URL="$BACKEND_URL" pnpm build )
```

**Extension only**, after the stack is up:
```bash
( cd "$_ROOT/pretzel" && VITE_API_BASE="$BACKEND_URL" pnpm build:e2e )
```

These rebuild the shared output dir pointed at *this run's* isolated
backend — which is exactly why the Step 0 lock exists.

If any stack fails to come up healthy (check `agent-stack-daemon.sh`'s own
health-wait output, or the `/tmp/backend-<label>.log` it references), skip
that product, note the failure in the fleet summary, and still tear down
whatever partially started (Step 4) — don't leave orphaned containers.

## Step 2: Spawn the QA agent

One `Agent` call per product (background unless `--sequential`, in which case
`run_in_background: false` so the loop naturally serializes). Self-contained
prompt — the subagent has no memory of this conversation:

> Use the Skill tool to invoke `qa-only` (for `backend`/`console`/`web`,
> passing `<resolved target URL>` and `--timebox <duration>`) or
> `qa-desktop`/`qa-extension` (for those two — no URL, they drive their own
> bridge; still apply the same ~<duration> time budget even though those
> skills don't have a native `--timebox` flag: note the start time yourself,
> stop exploring and write the report when the budget's spent). Report-only —
> do not fix anything found, even though `qa-desktop`/`qa-extension` default
> to fix-mode; explicitly override that and stay report-only for this run.
> Act like a manual QA tester doing a quick pass on `<product>`: explore
> what's actually there, don't run a fixed checklist, don't aim for
> exhaustive coverage in the time available.
>
> Output the normal QA report to `<OUT_DIR>/<product>/`.
>
> Additionally, once the report is written, create
> `<OUT_DIR>/<product>/jira-tickets.md`: one block per issue found, in this
> shape:
>
> ```
> ## [<product>] <short title>
>
> **Priority:** <Highest|High|Medium|Low>  (from severity: critical→Highest,
> high→High, medium→Medium, low→Low)
> **Environment:** <product> — <resolved target / isolated URL>
>
> **Description**
> Expected: <what should happen>
> Actual: <what happens instead>
>
> **Steps to Reproduce**
> 1. ...
> 2. ...
> 3. **Observe:** ...
>
> **Screenshots:** <relative paths to the same screenshot files the QA report
> already captured for this issue — don't recapture>
> ```
>
> If zero issues were found in the time available, still write
> `jira-tickets.md` with just "No issues found in <duration> exploratory
> pass" — don't skip the file.

## Step 3: Track and teardown

Record `<product> → AGENT_LABEL` before spawning so the mapping survives
across the async gap between spawn and completion notification. When each
product's agent reports back:

1. `"$_ROOT/scripts/agent-stack-stop.sh" "$AGENT_LABEL"` — tears down that
   product's isolated Postgres + backend (+ console/web).
2. For `desktop`/`extension`: `rm -f "$_ROOT/.gstack/agent-stacks/.locks/<product>"`.
3. Note completion (report path + issue count) for the fleet summary.

Tear down **on completion regardless of whether the agent found issues or
errored** — don't leave isolated stacks running because a product's QA pass
failed partway.

## Step 4: Fleet summary

Once every requested product has reported back (and been torn down), write
`<OUT_DIR>/SUMMARY.md`:

```
# QA Fleet Run <RUN_ID>

| Product | Health Score | Issues | Jira tickets |
|---|---|---|---|
| backend | 82/100 | 3 | [backend/jira-tickets.md](backend/jira-tickets.md) |
| ... | | | |

Timebox: <duration> per product. Mode: <parallel|sequential>.
```

Tell the user where it landed and how many total issues were found across
the fleet. Do not attempt to post any ticket to Jira — no Atlassian MCP
server is configured in this repo. `jira-tickets.md` is paste-ready markdown
for manual "Create issue" use. (If an `atlassian-mcp` server is configured
later, this is the step that would call it — one create-ticket call per
`## [product] title` block in each product's `jira-tickets.md`.)
