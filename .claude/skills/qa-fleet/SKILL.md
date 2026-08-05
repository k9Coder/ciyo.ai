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
  agent still picks what's worth probing itself). This bounds *exploration*,
  not the agent's total wall-clock (write-up, screenshots, and retries run on
  top of it) — see Step 3's hard-timeout backstop for the actual kill switch
  (`<duration> + 3 minutes`).
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

**Desktop/extension only, before building:** kill any `qa-bridge` server left
running from a previous run. `qa-bridge` caches its browser/app context at
module scope and reuses it across calls (`ensureServer`/`ensureContext`
never restart it) — if a stale one from an earlier run is still alive, the
build below changes the dist output's content-hashed filenames but the
already-loaded extension/app instance keeps referencing the old ones,
producing phantom 404s / a window that never re-renders that look like
product bugs but are actually stale QA-tooling state. Same kill command as
teardown (Step 3):
```bash
_BRIDGE_PATH="pretzel-desktop/qa-bridge/server.mjs"   # or pretzel/qa-bridge/server.mjs for extension
if command -v pkill >/dev/null 2>&1; then
  pkill -f "$_BRIDGE_PATH" 2>/dev/null
else
  # Plain substrings only, no backslash-converted path matching — an
  # earlier version built the LIKE pattern with ${VAR//\//\\\\}, which
  # wmic rejects as "Invalid query" (not "no match"). Since the query
  # errors, `grep -oE '[0-9]+'` finds no digits, `_PID` stays empty, and
  # the teardown looks like it succeeded while silently doing nothing —
  # this is what let qa-bridge/Electron/Chrome trees survive past every
  # prior "torn down clean" claim. "pretzel" is a substring of
  # "pretzel-desktop", so distinguish the two explicitly, and loop over
  # every matched PID (the query can match more than one process).
  if [ "<product>" = "desktop" ]; then
    _WHERE="CommandLine like '%pretzel-desktop%qa-bridge%'"
  else
    _WHERE="CommandLine like '%qa-bridge%server.mjs%' and not CommandLine like '%pretzel-desktop%'"
  fi
  wmic process where "$_WHERE" get ProcessId 2>/dev/null | grep -oE '^[0-9]+' | while read -r _PID; do
    taskkill //F //PID "$_PID" //T 2>/dev/null
  done
fi
```

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
> **For `console`/`web` only:** the stack was seeded with `seed:e2e`, so a
> real login exists — sign in through the UI with `testuser@gmail.com` /
> `TESTuser` (same identity `qa-env`'s local mode documents) to reach the
> authenticated surface. Don't stop at the login screen — an unauthenticated-
> only pass misses the vast majority of the product.
>
> **Hard timeout: <duration_minutes + 3> minutes** for this whole task
> (explore + write-up). If you're going to blow past it, stop wherever you
> are and write whatever report/jira-tickets.md you can with what you've
> found so far rather than leaving nothing — a partial report beats no
> report.
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

## Step 3: Track, hard-timeout, and teardown

Record `<product> → AGENT_LABEL` (and each agent's `agentId`) before spawning
so the mapping survives across the async gap between spawn and completion
notification. When each product's agent reports back:

1. `"$_ROOT/scripts/agent-stack-stop.sh" "$AGENT_LABEL"` — tears down that
   product's isolated Postgres + backend (+ console/web).
2. **For `desktop`/`extension` only:** kill the `qa-bridge` server that
   `qa-desktop`/`qa-extension` spawned, and the app/browser it launched.
   `qa-bridge` is designed to stay alive across calls within a normal
   session — nothing in those skills stops it, and if the app it launched
   hung (e.g. a window that never rendered), the whole tree keeps running
   and spamming child processes indefinitely. Kill by matching command
   line, not by image name (`electron.exe`/`chrome.exe` match unrelated
   apps like VS Code or the user's browser — never blanket-kill by name):
   ```bash
   _BRIDGE_PATH="pretzel-desktop/qa-bridge/server.mjs"   # or pretzel/qa-bridge/server.mjs for extension
   if command -v pkill >/dev/null 2>&1; then
     pkill -f "$_BRIDGE_PATH" 2>/dev/null   # macOS/Linux
   else
     # See the matching note in Step 1 — plain substrings, no backslash-
     # converted path (wmic errors on that pattern rather than just not
     # matching, so a silent no-op looks like a successful kill). Loop
     # over every matched PID; "pretzel" is a substring of
     # "pretzel-desktop" so the two products need distinct WHERE clauses.
     if [ "<product>" = "desktop" ]; then
       _WHERE="CommandLine like '%pretzel-desktop%qa-bridge%'"
     else
       _WHERE="CommandLine like '%qa-bridge%server.mjs%' and not CommandLine like '%pretzel-desktop%'"
     fi
     wmic process where "$_WHERE" get ProcessId 2>/dev/null | grep -oE '^[0-9]+' | while read -r _PID; do
       taskkill //F //PID "$_PID" //T 2>/dev/null   # //T kills the app/browser it spawned too
     done
   fi
   ```
3. **Verify the kill actually worked** — re-check for a matching process
   after the kill (same `wmic`/`pkill` query, expect zero results) rather
   than trusting the kill command's own exit code. A query that errors or
   silently matches nothing is indistinguishable from "already dead"
   unless you check.
4. For `desktop`/`extension`: `rm -f "$_ROOT/.gstack/agent-stacks/.locks/<product>"`.
5. Note completion (report path + issue count) for the fleet summary.

Tear down **on completion regardless of whether the agent found issues or
errored** — don't leave isolated stacks running because a product's QA pass
failed partway.

**Hard timeout backstop.** The in-prompt deadline (Step 2) is a request, not
an enforcement — an agent can still hang (stuck selector, waiting on a
dialog, etc.) past it. Right after spawning all agents for this run, start
one background watcher per product so a hung agent still gets torn down
instead of sitting there indefinitely:

```bash
TIMEOUT_MIN=$(( ${DURATION_MIN:-3} + 3 ))   # e.g. 3m timebox -> 6m hard cap
( sleep "$(( TIMEOUT_MIN * 60 ))"; echo "TIMEOUT_CHECK: <product>" ) &
```

When a `TIMEOUT_CHECK: <product>` fires and that product's agent has **not**
already reported completion:

1. `TaskStop` the agent's `agentId` to kill it.
2. Run the normal teardown (steps 1-2 above) for that product anyway.
3. Write `<OUT_DIR>/<product>/jira-tickets.md` (if it doesn't already exist)
   with just: `TIMED OUT — agent killed after <TIMEOUT_MIN>m, no report
   produced.`
4. Record it in the fleet summary as `TIMED OUT (killed after <TIMEOUT_MIN>m)`
   in the Issues column instead of a count.

If the agent *had* already reported by the time the watcher fires, the
watcher is a no-op — just let it fire and ignore it.

## Step 4: Fleet summary

Once every requested product has reported back (and been torn down), write
`<OUT_DIR>/SUMMARY.md`:

```
# QA Fleet Run <RUN_ID>

| Product | Health Score | Issues | Jira tickets |
|---|---|---|---|
| backend | 82/100 | 3 | [backend/jira-tickets.md](backend/jira-tickets.md) |
| console | TIMED OUT (killed after 6m) | — | [console/jira-tickets.md](console/jira-tickets.md) |
| ... | | | |

Timebox: <duration> per product (hard cap: <duration> + 3m). Mode: <parallel|sequential>.
```

Tell the user where it landed and how many total issues were found across
the fleet. Do not attempt to post any ticket to Jira — no Atlassian MCP
server is configured in this repo. `jira-tickets.md` is paste-ready markdown
for manual "Create issue" use. (If an `atlassian-mcp` server is configured
later, this is the step that would call it — one create-ticket call per
`## [product] title` block in each product's `jira-tickets.md`.)
