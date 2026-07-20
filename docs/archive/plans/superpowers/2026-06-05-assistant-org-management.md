# Assistant Org Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the AI assistant to create/delete divisions, teams, and members via the same JSON-action loop already used for rules and subjects.

**Architecture:** The LLM returns `{ reply, actions[] }` — actions are stored, shown to the user for review, then executed on Apply. We extend the `Action` union with 8 new op types, inject members into the system-prompt snapshot, and add corresponding `case` blocks in `executeActions()` that call already-existing service functions. No new routes, no MCP, no RPC.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PostgreSQL, Vitest

---

## File Map

| File | Change |
|---|---|
| `backend/src/assistant/llm/interface.ts` | Add 8 new action types to `Action` union; add `Member` to `TenantSnapshot` |
| `backend/src/assistant/prompt.ts` | Import `Member`; add members to `TenantSnapshot`; inject into `CURRENT STATE`; document new ops in system prompt |
| `backend/src/assistant/service.ts` | `fetchSnapshot` also queries `members` table |
| `backend/src/assistant/apply.ts` | Add `case` blocks for all 8 new ops; add `toSlug` helper |
| `backend/tests/assistant-apply.test.ts` | Tests for all 8 new ops |
| `backend/tests/assistant-prompt.test.ts` | Tests that prompt includes members + new op docs |

---

## Task 1: Extend `Action` union and `TenantSnapshot`

**Files:**
- Modify: `backend/src/assistant/llm/interface.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
// backend/src/assistant/llm/interface.ts
export type RuleKind    = 'keyword' | 'pattern' | 'entropy' | 'score'
export type RuleAction  = 'warn' | 'block'
export type ReportLevel = 'none' | 'minimal' | 'medium' | 'rich'
export type MemberRole  = 'member' | 'division_admin' | 'super_admin'

export type Action =
  | { op: 'create_rule'; subjectId: string; kind: RuleKind; keywords?: string[]; pattern?: string;
      destinations?: string[]; destinationGroupIds?: string[];
      action: RuleAction; message?: string; reportLevel?: ReportLevel }
  | { op: 'update_rule';   ruleId: string;   patch: Record<string, unknown> }
  | { op: 'delete_rule';   ruleId: string }
  | { op: 'create_subject'; name: string; description?: string; divisionId?: string; teamId?: string }
  | { op: 'update_subject'; subjectId: string; patch: Record<string, unknown> }
  | { op: 'delete_subject'; subjectId: string }
  // org management
  | { op: 'create_division'; name: string }
  | { op: 'delete_division'; divisionId: string }
  | { op: 'create_team'; name: string; divisionId: string }
  | { op: 'delete_team'; teamId: string }
  | { op: 'create_member'; email: string; role: MemberRole; displayName?: string; adminDivisionId?: string }
  | { op: 'delete_member'; memberId: string }
  | { op: 'assign_member_team'; memberId: string; teamId: string }
  | { op: 'remove_member_team'; memberId: string; teamId: string }

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmResponse {
  reply: string
  actions: Action[]
}

export interface LlmService {
  chat(systemPrompt: string, history: LlmMessage[], userMessage: string): Promise<LlmResponse>
}
```

- [ ] **Step 2: Run TypeScript check to confirm no compile errors**

```
cd backend && npx tsc --noEmit
```

Expected: no errors (existing switch in `apply.ts` is exhaustive via `default` fallthrough — TypeScript will not error until we add cases, which is fine).

- [ ] **Step 3: Commit**

```bash
git add backend/src/assistant/llm/interface.ts
git commit -m "feat(assistant): extend Action union with org-management op types"
```

---

## Task 2: Add members to `TenantSnapshot` and `fetchSnapshot`

**Files:**
- Modify: `backend/src/assistant/prompt.ts`
- Modify: `backend/src/assistant/service.ts`

- [ ] **Step 1: Update `TenantSnapshot` in `prompt.ts` to include members**

In `backend/src/assistant/prompt.ts`, change the import line and interface:

```typescript
import type { Division, Team, Subject, Rule, Member } from '../db/schema.js'

export interface TenantSnapshot {
  divisions: Division[]
  teams:     Team[]
  subjects:  Subject[]
  rules:     Rule[]
  members:   Member[]
}
```

- [ ] **Step 2: Inject members into `CURRENT STATE` and document new ops**

Replace `buildSystemPrompt` body. The full new file:

```typescript
import type { Division, Team, Subject, Rule, Member } from '../db/schema.js'

export interface TenantSnapshot {
  divisions: Division[]
  teams:     Team[]
  subjects:  Subject[]
  rules:     Rule[]
  members:   Member[]
}

export function buildSystemPrompt(snapshot: TenantSnapshot): string {
  const divisionNames = Object.fromEntries(snapshot.divisions.map(d => [d.id, d.name]))
  const teamNames     = Object.fromEntries(snapshot.teams.map(t => [t.id, t.name]))

  const subjectLines = snapshot.subjects.map(s => {
    let scope = 'global'
    if (s.teamId && teamNames[s.teamId])                    scope = `team:${teamNames[s.teamId]}`
    else if (s.divisionId && divisionNames[s.divisionId])   scope = `division:${divisionNames[s.divisionId]}`
    return { id: s.id, name: s.name, description: s.description, scope }
  })

  const ruleSummaries = snapshot.rules.map(r => ({
    id: r.id, subjectId: r.subjectId, kind: r.kind,
    keywords: r.keywords, pattern: r.pattern, action: r.action, active: r.active,
  }))

  const memberSummaries = snapshot.members.map(m => ({
    id: m.id, email: m.email, role: m.role, adminDivisionId: m.adminDivisionId,
  }))

  return `You are Pretzel AI — an AI assistant built into the Pretzel Console that helps administrators manage data-loss prevention policies. Pretzel is a Chrome extension (by mykka.ai) that intercepts AI prompts (ChatGPT, Claude, Gemini, etc.) and warns or blocks users when they attempt to send sensitive data.

You help admins create, edit, and delete rules, subjects, divisions, teams, and members using natural language. Always confirm what you're about to do before listing actions. If the user's intent is ambiguous, ask a clarifying question instead of guessing. Never apply changes yourself — return them as structured actions for human review.

When a request requires creating an entity and then referencing it (e.g. "create a division then add a member to it"), propose only the first action and ask the user to apply it, then continue in the next message. You will receive the updated state after each apply.

DATA MODEL
- Division: top-level org unit. Fields: name
- Team: belongs to a division. Fields: name, divisionId
- Member: a user in the org. Fields: email, role (member|division_admin|super_admin), adminDivisionId (only for division_admin)
- Subject: a policy topic scoped to a division, team, or the whole org (global). Fields: name, description, divisionId?, teamId?
- Rule: a detection rule attached to a subject. Fields: kind (keyword|pattern|entropy|score), keywords[], pattern, action (warn|block), message, reportLevel (none|minimal|medium|rich)
- Division → Team → Subject → Rule (hierarchy)

RULE KINDS
- keyword: exact word/phrase match (e.g. ["SSN", "social security number"])
- pattern: regex match (e.g. "\\d{3}-\\d{2}-\\d{4}" for SSN format)
- entropy: flags high-entropy strings (API keys, tokens). No keywords/pattern needed.
- score: composite risk score across multiple signals.

CURRENT STATE
Divisions: ${JSON.stringify(snapshot.divisions.map(d => ({ id: d.id, name: d.name })))}
Teams: ${JSON.stringify(snapshot.teams.map(t => ({ id: t.id, name: t.name, divisionId: t.divisionId })))}
Members: ${JSON.stringify(memberSummaries)}
Subjects: ${JSON.stringify(subjectLines)}
Rules: ${JSON.stringify(ruleSummaries)}

RESPONSE FORMAT
Always respond with valid JSON in this exact shape:
{"reply":"A friendly explanation of what you're proposing or asking.","actions":[]}

Action types you may use:
- {"op":"create_rule","subjectId":"...","kind":"keyword","keywords":[...],"action":"block","message":"..."}
- {"op":"update_rule","ruleId":"...","patch":{...}}
- {"op":"delete_rule","ruleId":"..."}
- {"op":"create_subject","name":"...","description":"...","teamId":"..."}
- {"op":"update_subject","subjectId":"...","patch":{...}}
- {"op":"delete_subject","subjectId":"..."}
- {"op":"create_division","name":"..."}
- {"op":"delete_division","divisionId":"..."}
- {"op":"create_team","name":"...","divisionId":"..."}
- {"op":"delete_team","teamId":"..."}
- {"op":"create_member","email":"...","role":"member|division_admin|super_admin","displayName":"...","adminDivisionId":"..."}
- {"op":"delete_member","memberId":"..."}
- {"op":"assign_member_team","memberId":"...","teamId":"..."}
- {"op":"remove_member_team","memberId":"...","teamId":"..."}

Use the exact IDs from CURRENT STATE above. Never invent IDs. Return actions:[] when asking a clarifying question or answering informational queries.

IMPORTANT: When an action creates a new entity whose ID is needed by a subsequent action (e.g. create_division then assign a member to it), propose only the create action first and instruct the user to apply it before continuing.

EXAMPLE
User: "Block any prompt that contains a credit card number on the Finance subject"
Response: {"reply":"I'll add a pattern rule to the Finance subject that blocks prompts matching credit card formats.","actions":[{"op":"create_rule","subjectId":"<Finance subject id>","kind":"pattern","pattern":"\\\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})\\\\b","action":"block","message":"Credit card numbers are not permitted in AI prompts."}]}`
}
```

- [ ] **Step 3: Update `fetchSnapshot` in `service.ts` to include members**

In `backend/src/assistant/service.ts`, update the import and `fetchSnapshot`:

```typescript
import { listDivisions } from '../divisions/service.js'
import { listSubjects } from '../subjects/service.js'
import { listAllActiveRules } from '../rules/service.js'
import { listMembers } from '../members/service.js'   // add this import
```

Replace `fetchSnapshot`:

```typescript
async function fetchSnapshot(tenantId: string): Promise<TenantSnapshot> {
  const [divisions, allTeams, subjects, rules, membersRaw] = await Promise.all([
    listDivisions(tenantId),
    db.select().from(teams).where(eq(teams.tenantId, tenantId)),
    listSubjects(tenantId),
    listAllActiveRules(tenantId),
    listMembers(tenantId),
  ])
  return { divisions, teams: allTeams, subjects, rules, members: membersRaw }
}
```

Note: `listMembers` returns `MemberRow[]` (with a `user` join field). `TenantSnapshot` types `members` as `Member[]`. Cast by spreading: `members: membersRaw.map(({ user: _user, ...m }) => m)` — or type `TenantSnapshot.members` as `MemberRow[]`. The simplest fix: type `members` as `Pick<MemberRow, 'id' | 'email' | 'role' | 'adminDivisionId'>[]` and map. Full updated `fetchSnapshot`:

```typescript
async function fetchSnapshot(tenantId: string): Promise<TenantSnapshot> {
  const [divisions, allTeams, subjects, rules, membersRaw] = await Promise.all([
    listDivisions(tenantId),
    db.select().from(teams).where(eq(teams.tenantId, tenantId)),
    listSubjects(tenantId),
    listAllActiveRules(tenantId),
    listMembers(tenantId),
  ])
  return {
    divisions,
    teams: allTeams,
    subjects,
    rules,
    members: membersRaw.map(({ user: _user, ...m }) => m),
  }
}
```

- [ ] **Step 4: Run TypeScript check**

```
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/assistant/prompt.ts backend/src/assistant/service.ts
git commit -m "feat(assistant): add members to snapshot and system prompt; document org ops"
```

---

## Task 3: Implement `executeActions` cases for org ops

**Files:**
- Modify: `backend/src/assistant/apply.ts`

- [ ] **Step 1: Write the failing tests first** (in Task 4 — do that task before this one if doing TDD)

Skip to Task 4 now, come back here after tests are written.

- [ ] **Step 2: Add `toSlug` helper and new cases to `apply.ts`**

Full updated file:

```typescript
import type { Action } from './llm/interface.js'
import { createRule, updateRule, deleteRule } from '../rules/service.js'
import { createSubject, updateSubject, deleteSubject } from '../subjects/service.js'
import { createDivision, deleteDivision } from '../divisions/service.js'
import { createTeam, deleteTeam } from '../teams/service.js'
import { createMember, deleteMember, updateMember, assignTeam, removeTeam } from '../members/service.js'

export interface ApplyResult {
  applied: Action[]
  errors: string[]
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function executeActions(tenantId: string, actions: Action[]): Promise<ApplyResult> {
  const applied: Action[] = []
  const errors: string[] = []

  for (const action of actions) {
    try {
      switch (action.op) {
        case 'create_rule':
          await createRule(tenantId, action.subjectId, {
            kind:                action.kind,
            keywords:            action.keywords ?? null,
            pattern:             action.pattern ?? null,
            destinations:        action.destinations ?? [],
            destinationGroupIds: action.destinationGroupIds ?? [],
            action:              action.action,
            message:             action.message ?? null,
            reportLevel:         action.reportLevel ?? 'none',
          })
          applied.push(action)
          break

        case 'update_rule':
          await updateRule(tenantId, action.ruleId, action.patch as Parameters<typeof updateRule>[2])
          applied.push(action)
          break

        case 'delete_rule':
          await deleteRule(tenantId, action.ruleId)
          applied.push(action)
          break

        case 'create_subject':
          await createSubject(tenantId, {
            name:        action.name,
            description: action.description ?? null,
            divisionId:  action.divisionId ?? null,
            teamId:      action.teamId ?? null,
          })
          applied.push(action)
          break

        case 'update_subject':
          await updateSubject(tenantId, action.subjectId, action.patch as Parameters<typeof updateSubject>[2])
          applied.push(action)
          break

        case 'delete_subject':
          await deleteSubject(tenantId, action.subjectId)
          applied.push(action)
          break

        case 'create_division': {
          await createDivision(tenantId, { name: action.name, slug: toSlug(action.name) })
          applied.push(action)
          break
        }

        case 'delete_division':
          await deleteDivision(tenantId, action.divisionId)
          applied.push(action)
          break

        case 'create_team': {
          await createTeam(tenantId, action.divisionId, { name: action.name, slug: toSlug(action.name) })
          applied.push(action)
          break
        }

        case 'delete_team':
          await deleteTeam(tenantId, action.teamId)
          applied.push(action)
          break

        case 'create_member': {
          const member = await createMember(tenantId, {
            email:       action.email,
            role:        action.role,
            displayName: action.displayName ?? null,
          })
          if (action.adminDivisionId) {
            await updateMember(tenantId, member.id, { adminDivisionId: action.adminDivisionId })
          }
          applied.push(action)
          break
        }

        case 'delete_member':
          await deleteMember(tenantId, action.memberId)
          applied.push(action)
          break

        case 'assign_member_team':
          await assignTeam(action.memberId, action.teamId)
          applied.push(action)
          break

        case 'remove_member_team':
          await removeTeam(action.memberId, action.teamId)
          applied.push(action)
          break
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${action.op}: ${message}`)
    }
  }

  return { applied, errors }
}
```

- [ ] **Step 3: Run TypeScript check**

```
cd backend && npx tsc --noEmit
```

Expected: no errors.

---

## Task 4: Tests for new `executeActions` cases

**Files:**
- Modify: `backend/tests/assistant-apply.test.ts`

- [ ] **Step 1: Add imports and new `describe` block to existing test file**

Append after the existing `describe('executeActions', ...)` block:

```typescript
import { divisions, teams, members, memberTeams } from '../src/db/schema.js'
// (add to existing import from '../src/db/schema.js' — merge with the existing import line)
```

Update the existing import to:
```typescript
import { subjects, rules, divisions, teams, members, memberTeams } from '../src/db/schema.js'
```

- [ ] **Step 2: Add test cases for divisions**

Append inside the existing `describe('executeActions', () => {` block:

```typescript
  it('creates a division', async () => {
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_division', name: 'Legal' },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(divisions).where(eq(divisions.tenantId, tenantId))
    expect(rows.some(d => d.name === 'Legal')).toBe(true)
    expect(rows.find(d => d.name === 'Legal')?.slug).toBe('legal')
  })

  it('deletes a division', async () => {
    const [div] = await db.insert(divisions).values({ tenantId, name: 'ToDelete', slug: 'todelete' }).returning()
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'delete_division', divisionId: div!.id },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(divisions).where(eq(divisions.id, div!.id))
    expect(rows).toHaveLength(0)
  })
```

- [ ] **Step 3: Add test cases for teams**

```typescript
  it('creates a team inside a division', async () => {
    const [div] = await db.insert(divisions).values({ tenantId, name: 'Eng', slug: 'eng' }).returning()
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_team', name: 'Backend', divisionId: div!.id },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(teams).where(eq(teams.tenantId, tenantId))
    expect(rows.some(t => t.name === 'Backend')).toBe(true)
    expect(rows.find(t => t.name === 'Backend')?.slug).toBe('backend')
  })

  it('deletes a team', async () => {
    const [div] = await db.insert(divisions).values({ tenantId, name: 'Eng', slug: 'eng' }).returning()
    const [team] = await db.insert(teams).values({ tenantId, divisionId: div!.id, name: 'Backend', slug: 'backend' }).returning()
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'delete_team', teamId: team!.id },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(teams).where(eq(teams.id, team!.id))
    expect(rows).toHaveLength(0)
  })
```

- [ ] **Step 4: Add test cases for members**

```typescript
  it('creates a member', async () => {
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_member', email: 'jane@example.com', role: 'member' },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(members).where(eq(members.tenantId, tenantId))
    expect(rows.some(m => m.email === 'jane@example.com')).toBe(true)
  })

  it('creates a division_admin member and sets adminDivisionId', async () => {
    const [div] = await db.insert(divisions).values({ tenantId, name: 'Legal', slug: 'legal' }).returning()
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_member', email: 'admin@example.com', role: 'division_admin', adminDivisionId: div!.id },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(members).where(eq(members.tenantId, tenantId))
    const created = rows.find(m => m.email === 'admin@example.com')
    expect(created?.role).toBe('division_admin')
    expect(created?.adminDivisionId).toBe(div!.id)
  })

  it('deletes a member', async () => {
    const [mem] = await db.insert(members).values({ tenantId, email: 'del@example.com', role: 'member' }).returning()
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'delete_member', memberId: mem!.id },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(members).where(eq(members.id, mem!.id))
    expect(rows).toHaveLength(0)
  })

  it('assigns and removes a member from a team', async () => {
    const [div]  = await db.insert(divisions).values({ tenantId, name: 'Eng', slug: 'eng' }).returning()
    const [team] = await db.insert(teams).values({ tenantId, divisionId: div!.id, name: 'Backend', slug: 'backend' }).returning()
    const [mem]  = await db.insert(members).values({ tenantId, email: 'dev@example.com', role: 'member' }).returning()

    const assign = await executeActions(tenantId, [
      { op: 'assign_member_team', memberId: mem!.id, teamId: team!.id },
    ])
    expect(assign.errors).toHaveLength(0)
    const afterAssign = await db.select().from(memberTeams)
      .where(and(eq(memberTeams.memberId, mem!.id), eq(memberTeams.teamId, team!.id)))
    expect(afterAssign).toHaveLength(1)

    const remove = await executeActions(tenantId, [
      { op: 'remove_member_team', memberId: mem!.id, teamId: team!.id },
    ])
    expect(remove.errors).toHaveLength(0)
    const afterRemove = await db.select().from(memberTeams)
      .where(and(eq(memberTeams.memberId, mem!.id), eq(memberTeams.teamId, team!.id)))
    expect(afterRemove).toHaveLength(0)
  })
```

Note: `and` is already imported via drizzle at the top of the test file — confirm it's in the import list: `import { eq, and } from 'drizzle-orm'`.

- [ ] **Step 5: Run the tests to confirm they pass**

```
cd backend && pnpm test -- assistant-apply
```

Expected: all tests pass including the 8 new ones.

- [ ] **Step 6: Commit**

```bash
git add backend/src/assistant/apply.ts backend/tests/assistant-apply.test.ts
git commit -m "feat(assistant): add org-management actions — divisions, teams, members"
```

---

## Task 5: Update prompt tests

**Files:**
- Modify: `backend/tests/assistant-prompt.test.ts`

- [ ] **Step 1: Add `members` to the snapshot fixture and new assertions**

The existing `snapshot` object at line 4 needs a `members` field. Update it:

```typescript
const snapshot: TenantSnapshot = {
  divisions: [{ id: 'd1', name: 'Finance', tenantId: 't1', slug: 'finance', createdAt: new Date() }],
  teams:     [{ id: 'tm1', name: 'Analysts', tenantId: 't1', divisionId: 'd1', slug: 'analysts', createdAt: new Date() }],
  members:   [{ id: 'mem1', tenantId: 't1', email: 'alice@corp.com', displayName: 'Alice', role: 'super_admin',
                userId: null, adminDivisionId: null, createdAt: new Date() }],
  subjects:  [
    { id: 's1', name: 'SSN Policy', description: null, tenantId: 't1', divisionId: null, teamId: 'tm1', active: true, createdAt: new Date() },
    { id: 's2', name: 'Global Rules', description: null, tenantId: 't1', divisionId: null, teamId: null, active: true, createdAt: new Date() },
  ],
  rules: [
    { id: 'r1', subjectId: 's1', tenantId: 't1', kind: 'keyword', keywords: ['SSN'], pattern: null,
      destinations: [], destinationGroupIds: [], action: 'block', message: null,
      active: true, reportLevel: 'none', createdAt: new Date() },
  ],
}
```

Add new test cases inside `describe('buildSystemPrompt', () => {`:

```typescript
  it('includes member email in CURRENT STATE', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('alice@corp.com')
    expect(prompt).toContain('mem1')
  })

  it('documents create_division op', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('create_division')
  })

  it('documents create_member op', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('create_member')
  })

  it('works with empty members', () => {
    const empty: TenantSnapshot = { divisions: [], teams: [], subjects: [], rules: [], members: [] }
    const prompt = buildSystemPrompt(empty)
    expect(prompt).toContain('Members: []')
  })
```

- [ ] **Step 2: Run prompt tests**

```
cd backend && pnpm test -- assistant-prompt
```

Expected: all pass.

- [ ] **Step 3: Run full test suite**

```
cd backend && pnpm test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/assistant-prompt.test.ts
git commit -m "test(assistant): update prompt tests for members + org op assertions"
```

---

## Self-Review

**Spec coverage:**
- ✅ `create_division` / `delete_division` — Task 1 + 3 + 4
- ✅ `create_team` / `delete_team` — Task 1 + 3 + 4
- ✅ `create_member` / `delete_member` — Task 1 + 3 + 4
- ✅ `assign_member_team` / `remove_member_team` — Task 1 + 3 + 4
- ✅ Members injected into system prompt — Task 2 + 5
- ✅ New ops documented in system prompt — Task 2 + 5
- ✅ Snapshot multi-turn awareness (LLM sees new IDs after apply) — handled by existing `fetchSnapshot` being called on every message

**Placeholder scan:** None found.

**Type consistency:**
- `toSlug` used in both `create_division` and `create_team` cases ✅
- `adminDivisionId` set via `updateMember` after `createMember` — `updateMember` accepts `adminDivisionId` ✅
- `assignTeam(memberId, teamId)` / `removeTeam(memberId, teamId)` — matches service signatures ✅
- `listMembers` returns `MemberRow[]` — spread to strip `user` field before storing in `TenantSnapshot` ✅
