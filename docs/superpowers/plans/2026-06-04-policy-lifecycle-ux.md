# Policy Lifecycle UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface "unpublished changes" as a first-class concept throughout the console, add post-apply guidance from the AI Assistant, and show a getting-started checklist on first-run Dashboard.

**Architecture:** The backend already tracks `publishedAt` on policies. We derive "has unpublished changes" by comparing the latest `publishedAt` timestamp against the latest `updatedAt` on any rule or subject. A new `/v1/policy/draft-status` endpoint exposes this. The frontend uses it to show a persistent banner and redirect hint.

**Tech Stack:** React, TanStack Query, Fastify, Drizzle, existing `usePolicy` hook.

---

### Task 1: Backend — Draft Status Endpoint

**Files:**
- Modify: `backend/src/policy/router.ts`
- Modify: `backend/src/policy/service.ts`

- [ ] Step 1: Add a `getDraftStatus` function to `backend/src/policy/service.ts`.

Add this after `getHistory`:
```typescript
import { sql as drizzleSql } from 'drizzle-orm'

export async function getDraftStatus(tenantId: string): Promise<{
  hasUnpublishedChanges: boolean
  lastPublishedAt:       string | null
  lastModifiedAt:        string | null
}> {
  const [latest] = await db
    .select({ publishedAt: policies.publishedAt })
    .from(policies)
    .where(eq(policies.tenantId, tenantId))
    .orderBy(desc(policies.version))
    .limit(1)

  const lastPublishedAt = latest?.publishedAt ?? null

  // Find the most recently modified rule or subject
  const [latestRule] = await db
    .select({ updatedAt: drizzleSql<Date>`MAX(${rules.createdAt})` })
    .from(rules)
    .where(eq(rules.tenantId, tenantId))

  const [latestSubject] = await db
    .select({ updatedAt: drizzleSql<Date>`MAX(${subjects.createdAt})` })
    .from(subjects)
    .where(eq(subjects.tenantId, tenantId))

  const ruleTs     = latestRule?.updatedAt     ? new Date(latestRule.updatedAt).getTime()    : 0
  const subjectTs  = latestSubject?.updatedAt  ? new Date(latestSubject.updatedAt).getTime() : 0
  const lastModTs  = Math.max(ruleTs, subjectTs)
  const lastModAt  = lastModTs > 0 ? new Date(lastModTs).toISOString() : null

  const publishedTs = lastPublishedAt ? new Date(lastPublishedAt).getTime() : 0
  const hasUnpublishedChanges = lastModTs > publishedTs

  return {
    hasUnpublishedChanges,
    lastPublishedAt: lastPublishedAt ? new Date(lastPublishedAt).toISOString() : null,
    lastModifiedAt:  lastModAt,
  }
}
```

Add the imports at the top of the file (they likely already exist, check before adding):
```typescript
import { rules, subjects } from '../db/schema.js'
```

- [ ] Step 2: Add the route in `backend/src/policy/router.ts`. Open the file and add a new GET route:
```typescript
import { getDraftStatus } from './service.js'

// Add inside the router function:
fastify.get('/policy/draft-status',
  { preHandler: requireAdminTokenOrClerkAdmin },
  async (req) => {
    return getDraftStatus(req.tenant.id)
  }
)
```

- [ ] Step 3: Build and test manually.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
# Expected: (empty)
curl -H "Authorization: Bearer ps_adm_<slug>_<secret>" http://localhost:3000/v1/policy/draft-status
# Expected: {"hasUnpublishedChanges":true,"lastPublishedAt":"2026-05-01T...","lastModifiedAt":"2026-06-01T..."}
```

- [ ] Step 4: Commit.
```bash
git add backend/src/policy/service.ts backend/src/policy/router.ts
git commit -m "feat(policy): add GET /v1/policy/draft-status endpoint

Returns hasUnpublishedChanges, lastPublishedAt, lastModifiedAt.
Used by frontend to show unpublished changes banner."
```

---

### Task 2: Frontend — Unpublished Changes Banner

**Files:**
- Modify: `pretzel-console/src/hooks/usePolicy.ts`
- Create: `pretzel-console/src/components/policy/UnpublishedChangesBanner.tsx`
- Modify: `pretzel-console/src/components/layout/AppLayout.tsx`

- [ ] Step 1: Add a `useDraftStatus` hook in `pretzel-console/src/hooks/usePolicy.ts`. Open the file and add:
```typescript
export function useDraftStatus() {
  return useQuery({
    queryKey: ['policy', 'draft-status'],
    queryFn: async () => {
      const res = await api.get('/v1/policy/draft-status')
      return res.data as { hasUnpublishedChanges: boolean; lastPublishedAt: string | null; lastModifiedAt: string | null }
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}
```

- [ ] Step 2: Create `pretzel-console/src/components/policy/UnpublishedChangesBanner.tsx`:
```tsx
import { Link } from 'react-router-dom'
import { useDraftStatus } from '../../hooks/usePolicy'

export function UnpublishedChangesBanner() {
  const { data } = useDraftStatus()
  if (!data?.hasUnpublishedChanges) return null

  return (
    <div
      role="alert"
      style={{
        background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.06))',
        borderBottom: '1px solid rgba(245, 158, 11, 0.4)',
        padding: '8px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 12, color: 'var(--text-primary)',
        flexShrink: 0,
      }}
    >
      <span>
        <span style={{ color: '#f59e0b', fontWeight: 600, marginRight: 8 }}>
          Unpublished changes
        </span>
        Policy rules have changed and are not yet live in the extension.
      </span>
      <Link
        to="/publish"
        style={{
          background: '#f59e0b', color: '#fff',
          padding: '4px 12px', borderRadius: 6,
          fontSize: 11, fontWeight: 600, textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Publish now
      </Link>
    </div>
  )
}
```

- [ ] Step 3: Add the banner to `AppLayout.tsx`. In the main content area, add `<UnpublishedChangesBanner />` between the top bar and the page content outlet:

Import it:
```typescript
import { UnpublishedChangesBanner } from '../policy/UnpublishedChangesBanner'
```

In the JSX, between the `{/* Top bar */}` div and `{/* Page content */}` div:
```tsx
{/* Unpublished changes warning */}
<UnpublishedChangesBanner />
```

- [ ] Step 4: Build and run the dev server to verify the banner appears when rules exist without a publish.
```bash
cd pretzel-console && pnpm run build 2>&1 | tail -5
# Expected: build succeeds
```

- [ ] Step 5: Commit.
```bash
git add pretzel-console/src/hooks/usePolicy.ts \
        pretzel-console/src/components/policy/UnpublishedChangesBanner.tsx \
        pretzel-console/src/components/layout/AppLayout.tsx
git commit -m "feat(ux): show unpublished changes banner across all pages

Admin now sees a persistent amber banner with 'Publish now' link
whenever policy rules have changed since the last publish."
```

---

### Task 3: Post-Apply Guidance in AI Assistant (UX-C5)

**Files:**
- Modify: `pretzel-console/src/pages/AssistantPage.tsx`

- [ ] Step 1: Open `pretzel-console/src/pages/AssistantPage.tsx`. After `applyMutation` succeeds, show an in-page toast/banner with links to Subjects and Publish.

Update the `handleApply` function and add state:
```tsx
const [applySuccess, setApplySuccess] = useState<{ applied: number } | null>(null)

function handleApply(messageId: string) {
  applyMutation.mutate(messageId, {
    onSuccess: (data) => {
      setApplySuccess({ applied: data.applied?.length ?? 0 })
    },
  })
}
```

Add a success banner in the JSX return, inside the outer div before `<ChatPane>`:
```tsx
{applySuccess && (
  <div style={{
    position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '12px 20px', zIndex: 100,
    display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
    fontSize: 13, color: 'var(--text-primary)',
  }}>
    <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>
      {applySuccess.applied} change{applySuccess.applied !== 1 ? 's' : ''} applied.
    </span>
    <span style={{ color: 'var(--text-muted)' }}>Policy has unpublished changes.</span>
    <Link to="/subjects" style={{ color: 'var(--brand-primary)', textDecoration: 'none', fontWeight: 500 }}>
      View Policies
    </Link>
    <Link to="/publish" style={{
      background: 'var(--brand-primary)', color: '#fff',
      padding: '5px 12px', borderRadius: 6, textDecoration: 'none', fontWeight: 600,
    }}>
      Publish
    </Link>
    <button onClick={() => setApplySuccess(null)} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: 'var(--text-muted)', fontSize: 16, padding: '0 4px',
    }}>
      ×
    </button>
  </div>
)}
```

Add the `Link` import from `react-router-dom` at the top if not already present.

- [ ] Step 2: Build.
```bash
cd pretzel-console && pnpm run build 2>&1 | tail -5
# Expected: build succeeds
```

- [ ] Step 3: Commit.
```bash
git add pretzel-console/src/pages/AssistantPage.tsx
git commit -m "feat(ux): show post-apply guidance after AI assistant applies changes

After Apply succeeds, shows a dismissable banner: 'N changes applied.
Policy has unpublished changes.' with links to Policies and Publish."
```

---

### Task 4: First-Run Dashboard Checklist (UX-C3)

**Files:**
- Create: `pretzel-console/src/components/dashboard/GettingStartedChecklist.tsx`
- Modify: `pretzel-console/src/pages/DashboardPage.tsx`

- [ ] Step 1: Create `pretzel-console/src/components/dashboard/GettingStartedChecklist.tsx`:
```tsx
import { Link } from 'react-router-dom'

interface Step {
  label:    string
  done:     boolean
  linkTo:   string
  linkText: string
}

interface GettingStartedChecklistProps {
  steps: Step[]
}

export function GettingStartedChecklist({ steps }: GettingStartedChecklistProps) {
  const allDone = steps.every(s => s.done)
  if (allDone) return null

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 20,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
        Get started with Pretzel
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 8,
            background: step.done ? 'rgba(34,197,94,0.06)' : 'var(--bg-base)',
            border: `1px solid ${step.done ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
              background: step.done ? '#22c55e' : 'var(--bg-surface)',
              border: `1px solid ${step.done ? '#22c55e' : 'var(--border)'}`,
              color: step.done ? '#fff' : 'var(--text-muted)',
            }}>
              {step.done ? '✓' : i + 1}
            </span>
            <span style={{
              fontSize: 13, flex: 1, color: 'var(--text-primary)',
              textDecoration: step.done ? 'line-through' : 'none',
              opacity: step.done ? 0.5 : 1,
            }}>
              {step.label}
            </span>
            {!step.done && (
              <Link to={step.linkTo} style={{
                fontSize: 12, color: 'var(--brand-primary)',
                textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap',
              }}>
                {step.linkText} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] Step 2: Integrate into `pretzel-console/src/pages/DashboardPage.tsx`. The `summary` data already contains `activeRulesCount`, `totalMembers`, and we can use `policyInfo` for whether a policy has been published.

Add the component import and usage in `DashboardPage`:
```tsx
import { GettingStartedChecklist } from '../components/dashboard/GettingStartedChecklist'

// Inside DashboardPage, derive steps from summary data:
const isFirstRun = !summaryLoading && (summary?.scansTotal ?? 0) === 0

const gettingStartedSteps = [
  {
    label:    'Create your first policy rule',
    done:     (summary?.activeRulesCount ?? 0) > 0,
    linkTo:   '/subjects',
    linkText: 'Create rule',
  },
  {
    label:    'Add team members',
    done:     (summary?.totalMembers ?? 0) > 1,
    linkTo:   '/members',
    linkText: 'Add members',
  },
  {
    label:    'Publish policy to extension',
    done:     policyInfo != null && (policyInfo as { version?: number }).version != null,
    linkTo:   '/publish',
    linkText: 'Publish now',
  },
]

// In JSX, render the checklist when it's a first-run experience:
{isFirstRun && (
  <GettingStartedChecklist steps={gettingStartedSteps} />
)}
```

- [ ] Step 3: Build.
```bash
cd pretzel-console && pnpm run build 2>&1 | tail -5
# Expected: build succeeds
```

- [ ] Step 4: Commit.
```bash
git add pretzel-console/src/components/dashboard/GettingStartedChecklist.tsx \
        pretzel-console/src/pages/DashboardPage.tsx
git commit -m "feat(ux): first-run getting-started checklist on Dashboard

When all metrics are zero, shows a 3-step checklist:
Create rule → Add members → Publish policy.
Disappears once all three steps are complete."
```
