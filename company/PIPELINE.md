# ciyo.ai — Development Pipeline

> Every code change — feature, bug fix, refactor — follows this pipeline.
> No commit/push to a shared branch without both QA gates cleared.

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SPEC          PM writes acceptance criteria                  │
│                   (Ben Cho — before dev starts)                  │
├─────────────────────────────────────────────────────────────────┤
│  2. TEST PLAN     QA Analyst writes manual test plan            │
│                   (Lena Hartmann — from spec, before dev starts) │
├─────────────────────────────────────────────────────────────────┤
│  3. BUILD         Developer writes code + unit tests            │
│                   Self-review against acceptance criteria        │
│                   pnpm test + pnpm type-check must pass locally  │
├─────────────────────────────────────────────────────────────────┤
│  4. QA GATE       Developer signals "ready for QA"              │
│                                                                  │
│        ┌──────────────────┬──────────────────┐                  │
│        │  AUTOMATED (QA Lead)                │  MANUAL (QA)    │
│        │  Natasha Ivanova │                  │  Lena Hartmann  │
│        │                  │                  │                  │
│        │  runs Playwright │                  │  seeds test DB  │
│        │  suite against   │  (parallel)      │  runs test plan │
│        │  test DB         │                  │  exploratory    │
│        │  checks no       │                  │  session 30min  │
│        │  regression      │                  │  regression     │
│        │                  │                  │  checklist      │
│        └──────────────────┴──────────────────┘                  │
│                        ↓           ↓                             │
│              Natasha: PASS/BLOCK  Lena: PASS/BLOCK              │
│                                                                  │
│        BOTH PASS → proceed to step 5                            │
│        EITHER BLOCKS → bugs filed → back to step 3             │
├─────────────────────────────────────────────────────────────────┤
│  5. COMMIT/PUSH   Developer: git add → commit → push            │
│                   (only after both QA gates cleared)             │
├─────────────────────────────────────────────────────────────────┤
│  6. PR REVIEW     Marcus Webb (CTO) reviews code                │
│                   Checks: architecture, naming, test coverage    │
├─────────────────────────────────────────────────────────────────┤
│  7. CI            GitHub Actions runs full suite automatically   │
│                   All 4 playwright projects must pass            │
├─────────────────────────────────────────────────────────────────┤
│  8. MERGE + DEPLOY  Marcus merges. Ryan Kowalski deploys.       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Detail

### 1. Spec (Ben Cho — PM)

Before any development starts:
- PM writes a spec: user story, acceptance criteria, edge cases, out of scope
- Spec is the source of truth for both development and QA
- No ticket starts without a written spec

### 2. Test Plan (Lena Hartmann — QA Analyst)

Before development starts (parallel to dev setup):
- Lena reads the PM spec
- Writes a manual test plan: one test case per acceptance criterion + edge cases
- Plan is shared with the developer so they know exactly what will be tested

### 3. Build (Developer)

Developer writes the code. Before signaling QA-ready:

```bash
# Type check — must pass with zero errors
pnpm type-check

# Unit tests — must pass
pnpm test

# Self-review checklist:
# ✓ All acceptance criteria from spec addressed
# ✓ No commented-out code
# ✓ No console.log left in
# ✓ Relevant E2E test added or updated (if new behavior)
```

**Cross-package rules (from CLAUDE.md):**
- Changed DB schema or migrations? → `cd backend && pnpm seed:e2e` before QA
- Changed `GET /v1/policy` response shape? → flag to Natasha — she runs cross-service suite
- Changed assistant apply flow? → flag to Natasha — she runs assistant-specific suite
- Changed token format or auth middleware? → flag to Natasha — she runs full API suite

### 4. QA Gate

Developer opens a QA request (ticket/message) to both Natasha and Lena with:
- Link to the spec
- What changed (which package, what files)
- Which cross-package rules apply (if any)
- Local test DB seed already done: yes/no

---

#### Natasha Ivanova — Automated QA Gate

Runs based on what changed:

```bash
cd backend && pnpm seed:e2e        # always — ensures clean DB state

# Run the relevant projects:
npx playwright test                              # all (for major changes)
npx playwright test --project=api               # backend-only changes
npx playwright test --project=extension         # extension-only changes
npx playwright test --project=cross-service     # policy compiler, SSE, full flow
npx playwright test --project=admin             # console-only changes

# Targeted runs:
npx playwright test --project=api --grep "assistant"   # assistant flow
npx playwright test --project=cross-service            # policy → extension
```

**Natasha's sign-off criteria:**
- All relevant Playwright projects pass with zero failures
- No regression in projects not related to the change
- Detection bypass tests pass (if detection engine touched)

---

#### Lena Hartmann — Manual QA Gate

```bash
# 1. Seed test DB (clean state)
cd backend && pnpm seed:e2e

# 2. Execute manual test plan (from step 2)
#    One test case per acceptance criterion — documented pass/fail

# 3. Run Playwright projects locally (same as Natasha, independently)
npx playwright test --project=admin        # if console touched
npx playwright test --project=extension    # if extension touched
npx playwright test --project=api          # if backend touched

# 4. Exploratory session — 30 min unscripted on the feature area

# 5. Regression checklist — manual pass through critical flows:
#    - Extension detects on ChatGPT, Claude, Gemini
#    - Admin can create subject → rule → publish policy
#    - Extension picks up updated policy (SSE)
#    - Billing gates block/allow correct features
#    - Auth: login, invite, member management
```

**Lena's sign-off criteria:**
- All acceptance criteria from PM spec verified manually ✓
- Playwright runs pass locally against seeded DB ✓
- Exploratory session: no P0/P1 bugs open ✓
- Regression checklist: all critical flows pass ✓

---

#### QA Decision

| Natasha | Lena | Result |
|---|---|---|
| PASS | PASS | ✅ Proceed to commit/push |
| BLOCK | PASS | ❌ Fix automated failures, re-run Natasha |
| PASS | BLOCK | ❌ Fix manual findings, re-run Lena |
| BLOCK | BLOCK | ❌ Fix everything, re-run both |

Bugs filed by Lena: developer fixes, then re-runs **both** QA gates from scratch — not just the failed one.

### 5. Commit / Push

Only after both gates cleared:

```bash
git add <specific files>     # never git add -A blindly
git commit -m "..."
git push origin <branch>
```

### 6. PR Review (Marcus Webb — CTO)

Marcus reviews the PR for:
- Architecture correctness (no shortcuts, no tech debt introduced)
- Naming clarity (variables, functions, files)
- Test coverage (new behavior covered by tests)
- Cross-package regression risk (did this change touch shared contracts?)
- CLAUDE.md regression rules followed

### 7. CI (GitHub Actions)

On PR open and every push:
- Full `npx playwright test` runs automatically
- All 4 projects must pass
- If CI fails after local QA passed → Natasha investigates environment discrepancy

### 8. Merge + Deploy

- Marcus merges after PR approval
- Ryan Kowalski handles deploy to staging → production
- James Okafor (CS) notified of any change affecting customer-facing behavior

---

## Who Owns What in the Pipeline

| Step | Owner | Blocks next step? |
|---|---|---|
| Spec | Ben Cho (PM) | Yes — no spec, no dev |
| Test plan | Lena Hartmann (QA Analyst) | Yes — no plan, no QA gate |
| Build | Developer | Yes — self-check must pass |
| Automated QA | Natasha Ivanova (QA Lead) | Yes — must PASS |
| Manual QA | Lena Hartmann (QA Analyst) | Yes — must PASS |
| Commit/push | Developer | — |
| PR review | Marcus Webb (CTO) | Yes — must approve |
| CI | GitHub Actions | Yes — must pass |
| Deploy | Ryan Kowalski (DevOps) | — |

---

## Fast-Track (Hotfix / P0 Bug)

For production P0 bugs only:
1. Marcus Webb authorizes fast-track
2. Developer fixes + unit tests
3. Natasha runs targeted Playwright suite (affected project only) — no full suite required
4. Lena runs targeted manual check (affected flow only) — no full plan required
5. Marcus reviews and merges directly — no waiting for full CI
6. Ryan deploys immediately

Fast-track does NOT skip QA — it scopes it. Both QAs still sign off.
