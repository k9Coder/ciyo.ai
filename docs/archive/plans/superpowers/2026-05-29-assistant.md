# Assistant Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a conversational AI assistant to the mykka admin web app that lets super admins create, update, and delete rules and subjects using natural language, with a preview-then-confirm flow.

**Architecture:** Single-turn LLM approach: each message fetches the tenant's full state snapshot, builds a system prompt, calls the LLM (Anthropic or OpenAI via a swappable interface), and returns `{ reply, actions[] }`. The admin reviews proposed actions in a 50/50 split preview pane and clicks Apply to execute them via existing services.

**Tech Stack:** Backend — TypeScript ESM, Fastify, Drizzle ORM (Postgres), `@anthropic-ai/sdk` or `openai`, Vitest + Supertest. Frontend — React, TypeScript, TanStack Query, React Router, inline styles (existing pattern).

**Spec:** `docs/superpowers/specs/2026-05-29-assistant-design.md`

---

## Task 1: Install LLM packages and add env vars

**Files:**
- Modify: `backend/package.json` (via npm install)
- Modify: `backend/.env` (add LLM env vars)

- [ ] **Step 1: Install Anthropic and OpenAI SDKs**

```bash
cd backend && npm install @anthropic-ai/sdk openai
```

Expected: both packages appear in `node_modules`, `package.json` dependencies updated.

- [ ] **Step 2: Add env vars to backend/.env**

Add these lines to `backend/.env`:

```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-your-key-here
```

`LLM_PROVIDER` controls which implementation is used at runtime. Only the matching key needs to be set.

- [ ] **Step 3: Commit**

```bash
cd backend && git add package.json package-lock.json
git commit -m "chore(assistant): install @anthropic-ai/sdk and openai"
```

---

## Task 2: DB Schema — add chat_sessions and chat_messages tables

**Files:**
- Modify: `backend/src/db/schema.ts` (add two tables + enum + types)
- Modify: `backend/tests/helpers/db.ts` (update truncateAll to clean new tables)
- Create: migration via `npm run db:generate` then `npm run db:migrate`

- [ ] **Step 1: Add tables to schema.ts**

Open `backend/src/db/schema.ts`. After the existing `scans` table block and before the `// ── Types` comment, add:

```typescript
// ── Chat Sessions ─────────────────────────────────────────────────────────────
export const chatMessageRoleEnum = pgEnum('chat_message_role', ['user', 'assistant'])

export const chatSessions = pgTable('chat_sessions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull().references(() => tenants.id),
  memberId:  uuid('member_id').references(() => members.id),
  title:     text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index().on(t.tenantId),
}))

// ── Chat Messages ─────────────────────────────────────────────────────────────
export const chatMessages = pgTable('chat_messages', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sessionId:   uuid('session_id').notNull().references(() => chatSessions.id),
  role:        chatMessageRoleEnum('role').notNull(),
  content:     text('content').notNull(),
  actionsJson: jsonb('actions_json'),
  appliedAt:   timestamp('applied_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionIdx: index().on(t.sessionId),
}))
```

- [ ] **Step 2: Add TypeScript types at the bottom of schema.ts**

In the `// ── Types` section, append:

```typescript
export type ChatSession    = typeof chatSessions.$inferSelect
export type NewChatSession = typeof chatSessions.$inferInsert
export type ChatMessage    = typeof chatMessages.$inferSelect
export type NewChatMessage = typeof chatMessages.$inferInsert
```

- [ ] **Step 3: Generate migration**

```bash
cd backend && npm run db:generate
```

Expected: a new SQL file appears in `backend/drizzle/` containing `CREATE TABLE chat_sessions` and `CREATE TABLE chat_messages`.

- [ ] **Step 4: Run migration**

```bash
cd backend && npm run db:migrate
```

Expected: `Migrations applied successfully` (or similar). No errors.

- [ ] **Step 5: Update truncateAll in tests/helpers/db.ts**

Add `chatMessages` and `chatSessions` to the import and delete them before other tables (FK order: messages before sessions, sessions before members/tenants):

```typescript
import { tenants, policies, divisions, teams, members, memberTeams, subjects, rules,
         destinationGroups, siteConfigs, events, scans,
         chatMessages, chatSessions } from '../../src/db/schema.js'

export async function truncateAll(): Promise<void> {
  await db.delete(events)
  await db.delete(scans)
  await db.delete(chatMessages)
  await db.delete(chatSessions)
  await db.delete(memberTeams)
  await db.delete(rules)
  await db.delete(subjects)
  await db.delete(destinationGroups)
  await db.delete(siteConfigs)
  await db.delete(members)
  await db.delete(teams)
  await db.delete(divisions)
  await db.delete(policies)
  await db.delete(tenants)
}
```

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/db/schema.ts tests/helpers/db.ts drizzle/
git commit -m "feat(assistant): add chat_sessions and chat_messages tables"
```

---

## Task 3: LLM service interface and implementations

**Files:**
- Create: `backend/src/assistant/llm/interface.ts`
- Create: `backend/src/assistant/llm/anthropic.ts`
- Create: `backend/src/assistant/llm/openai.ts`

- [ ] **Step 1: Create the interface + action types**

Create `backend/src/assistant/llm/interface.ts`:

```typescript
export type RuleKind    = 'keyword' | 'pattern' | 'entropy' | 'score'
export type RuleAction  = 'warn' | 'block'
export type ReportLevel = 'none' | 'minimal' | 'medium' | 'rich'

export type Action =
  | { op: 'create_rule'; subjectId: string; kind: RuleKind; keywords?: string[]; pattern?: string;
      destinations?: string[]; destinationGroupIds?: string[];
      action: RuleAction; message?: string; reportLevel?: ReportLevel }
  | { op: 'update_rule';   ruleId: string;   patch: Record<string, unknown> }
  | { op: 'delete_rule';   ruleId: string }
  | { op: 'create_subject'; name: string; description?: string; divisionId?: string; teamId?: string }
  | { op: 'update_subject'; subjectId: string; patch: Record<string, unknown> }
  | { op: 'delete_subject'; subjectId: string }

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

- [ ] **Step 2: Create Anthropic implementation**

Create `backend/src/assistant/llm/anthropic.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { LlmService, LlmMessage, LlmResponse, Action } from './interface.js'

export class AnthropicLlmService implements LlmService {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async chat(systemPrompt: string, history: LlmMessage[], userMessage: string): Promise<LlmResponse> {
    const messages: Anthropic.MessageParam[] = [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return parseResponse(text)
  }
}

function parseResponse(text: string): LlmResponse {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON object found')
    const parsed = JSON.parse(match[0]) as { reply?: string; actions?: unknown[] }
    return {
      reply:   typeof parsed.reply === 'string' ? parsed.reply : 'Done.',
      actions: Array.isArray(parsed.actions) ? (parsed.actions as Action[]) : [],
    }
  } catch {
    return { reply: text, actions: [] }
  }
}
```

- [ ] **Step 3: Create OpenAI implementation**

Create `backend/src/assistant/llm/openai.ts`:

```typescript
import OpenAI from 'openai'
import type { LlmService, LlmMessage, LlmResponse, Action } from './interface.js'

export class OpenAiLlmService implements LlmService {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  async chat(systemPrompt: string, history: LlmMessage[], userMessage: string): Promise<LlmResponse> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const response = await this.client.chat.completions.create({
      model:           'gpt-4o',
      max_tokens:      2048,
      messages,
      response_format: { type: 'json_object' },
    })

    const text = response.choices[0]?.message?.content ?? ''
    return parseResponse(text)
  }
}

function parseResponse(text: string): LlmResponse {
  try {
    const parsed = JSON.parse(text) as { reply?: string; actions?: unknown[] }
    return {
      reply:   typeof parsed.reply === 'string' ? parsed.reply : 'Done.',
      actions: Array.isArray(parsed.actions) ? (parsed.actions as Action[]) : [],
    }
  } catch {
    return { reply: text, actions: [] }
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd backend && git add src/assistant/
git commit -m "feat(assistant): LLM service interface + Anthropic/OpenAI implementations"
```

---

## Task 4: System prompt builder

**Files:**
- Create: `backend/src/assistant/prompt.ts`
- Create: `backend/tests/assistant-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/assistant-prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, type TenantSnapshot } from '../src/assistant/prompt.js'

const snapshot: TenantSnapshot = {
  divisions: [{ id: 'd1', name: 'Finance', tenantId: 't1', slug: 'finance', createdAt: new Date() }],
  teams:     [{ id: 'tm1', name: 'Analysts', tenantId: 't1', divisionId: 'd1', slug: 'analysts', createdAt: new Date() }],
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

describe('buildSystemPrompt', () => {
  it('includes real IDs from snapshot', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('s1')
    expect(prompt).toContain('r1')
    expect(prompt).toContain('tm1')
  })

  it('resolves team scope for subject', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('team:Analysts')
  })

  it('resolves global scope for subject without team or division', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('global')
  })

  it('includes RESPONSE FORMAT section', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('RESPONSE FORMAT')
    expect(prompt).toContain('"reply"')
    expect(prompt).toContain('"actions"')
  })

  it('works with empty snapshot', () => {
    const empty: TenantSnapshot = { divisions: [], teams: [], subjects: [], rules: [] }
    const prompt = buildSystemPrompt(empty)
    expect(prompt).toContain('CURRENT STATE')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npm test -- --reporter=verbose tests/assistant-prompt.test.ts
```

Expected: FAIL — `Cannot find module '../src/assistant/prompt.js'`

- [ ] **Step 3: Implement prompt.ts**

Create `backend/src/assistant/prompt.ts`:

```typescript
import type { Division, Team, Subject, Rule } from '../db/schema.js'

export interface TenantSnapshot {
  divisions: Division[]
  teams:     Team[]
  subjects:  Subject[]
  rules:     Rule[]
}

export function buildSystemPrompt(snapshot: TenantSnapshot): string {
  const divisionNames = Object.fromEntries(snapshot.divisions.map(d => [d.id, d.name]))
  const teamNames     = Object.fromEntries(snapshot.teams.map(t => [t.id, t.name]))

  const subjectLines = snapshot.subjects.map(s => {
    let scope = 'global'
    if (s.teamId && teamNames[s.teamId])              scope = `team:${teamNames[s.teamId]}`
    else if (s.divisionId && divisionNames[s.divisionId]) scope = `division:${divisionNames[s.divisionId]}`
    return { id: s.id, name: s.name, description: s.description, scope }
  })

  const ruleSummaries = snapshot.rules.map(r => ({
    id: r.id, subjectId: r.subjectId, kind: r.kind,
    keywords: r.keywords, pattern: r.pattern, action: r.action, active: r.active,
  }))

  return `You are the mykka Assistant — an AI that helps administrators manage data-loss prevention policies for the mykka platform. mykka is a Chrome extension that intercepts AI prompts (ChatGPT, Gemini, etc.) and warns or blocks users when they attempt to send sensitive data.

You help admins create, edit, and delete rules and subjects using natural language. Always confirm what you're about to do before listing actions. If the user's intent is ambiguous (e.g. "all teams" when there are many), ask a clarifying question instead of guessing. Never apply changes yourself — return them as structured actions for human review.

DATA MODEL
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

Use the exact IDs from CURRENT STATE above. Never invent IDs. Return actions:[] when asking a clarifying question or answering informational queries.

EXAMPLE
User: "Block any prompt that contains a credit card number on the Finance subject"
Response: {"reply":"I'll add a pattern rule to the Finance subject that blocks prompts matching credit card formats.","actions":[{"op":"create_rule","subjectId":"<Finance subject id>","kind":"pattern","pattern":"\\\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})\\\\b","action":"block","message":"Credit card numbers are not permitted in AI prompts."}]}`
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npm test -- --reporter=verbose tests/assistant-prompt.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/assistant/prompt.ts tests/assistant-prompt.test.ts
git commit -m "feat(assistant): system prompt builder with tenant snapshot injection"
```

---

## Task 5: Action executor

**Files:**
- Create: `backend/src/assistant/apply.ts`
- Create: `backend/tests/assistant-apply.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/assistant-apply.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { subjects, rules } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import { executeActions } from '../src/assistant/apply.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let tenantId: string
let subjectId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  const [sub] = await db.insert(subjects).values({ tenantId, name: 'Test Subject', active: true }).returning()
  subjectId = sub!.id
})
afterAll(async () => { await app.close() })

describe('executeActions', () => {
  it('creates a keyword rule', async () => {
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_rule', subjectId, kind: 'keyword', keywords: ['secret'], action: 'block' },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const [rule] = await db.select().from(rules).where(eq(rules.subjectId, subjectId))
    expect(rule?.keywords).toContain('secret')
    expect(rule?.action).toBe('block')
  })

  it('creates a subject', async () => {
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_subject', name: 'New Subject' },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(subjects).where(eq(subjects.tenantId, tenantId))
    expect(rows.some(s => s.name === 'New Subject')).toBe(true)
  })

  it('deletes a rule', async () => {
    const [rule] = await db.insert(rules).values({
      tenantId, subjectId, kind: 'keyword', keywords: ['x'], action: 'block', active: true, reportLevel: 'none',
    }).returning()
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'delete_rule', ruleId: rule!.id },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const remaining = await db.select().from(rules).where(eq(rules.id, rule!.id))
    expect(remaining).toHaveLength(0)
  })

  it('records error for invalid FK and continues with remaining actions', async () => {
    // create_rule with non-existent subjectId triggers a FK violation
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_rule', subjectId: '00000000-0000-0000-0000-000000000000', kind: 'keyword', keywords: ['x'], action: 'block' },
      { op: 'create_subject', name: 'Safe Subject' },
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('create_rule')
    expect(applied).toHaveLength(1)
    expect(applied[0]!.op).toBe('create_subject')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npm test -- --reporter=verbose tests/assistant-apply.test.ts
```

Expected: FAIL — `Cannot find module '../src/assistant/apply.js'`

- [ ] **Step 3: Implement apply.ts**

Create `backend/src/assistant/apply.ts`:

```typescript
import { createRule, updateRule, deleteRule } from '../rules/service.js'
import { createSubject, updateSubject, deleteSubject } from '../subjects/service.js'
import type { Action } from './llm/interface.js'

export async function executeActions(
  tenantId: string,
  actions: Action[]
): Promise<{ applied: Action[]; errors: string[] }> {
  const applied: Action[] = []
  const errors:  string[] = []

  for (const action of actions) {
    try {
      switch (action.op) {
        case 'create_rule':
          await createRule(tenantId, action.subjectId, {
            kind:                action.kind,
            keywords:            action.keywords ?? null,
            pattern:             action.pattern  ?? null,
            destinations:        action.destinations        ?? [],
            destinationGroupIds: action.destinationGroupIds ?? [],
            action:              action.action,
            message:             action.message  ?? null,
            reportLevel:         action.reportLevel ?? 'none',
          })
          break
        case 'update_rule':
          await updateRule(tenantId, action.ruleId, action.patch as Parameters<typeof updateRule>[2])
          break
        case 'delete_rule':
          await deleteRule(tenantId, action.ruleId)
          break
        case 'create_subject':
          await createSubject(tenantId, {
            name:        action.name,
            description: action.description ?? null,
            divisionId:  action.divisionId  ?? null,
            teamId:      action.teamId      ?? null,
          })
          break
        case 'update_subject':
          await updateSubject(tenantId, action.subjectId, action.patch as Parameters<typeof updateSubject>[2])
          break
        case 'delete_subject':
          await deleteSubject(tenantId, action.subjectId)
          break
        default: {
          const exhausted = action as { op: string }
          errors.push(`Unknown op: ${exhausted.op}`)
          continue
        }
      }
      applied.push(action)
    } catch (e) {
      errors.push(`Failed ${action.op}: ${(e as Error).message}`)
    }
  }

  return { applied, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npm test -- --reporter=verbose tests/assistant-apply.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/assistant/apply.ts tests/assistant-apply.test.ts
git commit -m "feat(assistant): action executor delegating to existing services"
```

---

## Task 6: Assistant service, router, and app registration

**Files:**
- Create: `backend/src/assistant/service.ts`
- Create: `backend/src/assistant/router.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/assistant.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `backend/tests/assistant.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { subjects, chatSessions, chatMessages } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

// Mock the LLM so tests don't hit real APIs
vi.mock('../src/assistant/llm/anthropic.js', () => ({
  AnthropicLlmService: class {
    async chat(_sys: string, _hist: unknown[], message: string) {
      if (message.toLowerCase().includes('create')) {
        return {
          reply: 'Creating a keyword rule.',
          actions: [{ op: 'create_rule', subjectId: '__SUBJECT_ID__', kind: 'keyword', keywords: ['test'], action: 'block' }],
        }
      }
      return { reply: 'Got it.', actions: [] }
    }
  },
}))

let app: FastifyInstance
let adminToken: string
let tenantId: string
let subjectId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  adminToken = t.adminToken
  tenantId   = t.tenantId
  const [sub] = await db.insert(subjects).values({ tenantId, name: 'Test Subject', active: true }).returning()
  subjectId = sub!.id
})
afterAll(async () => { await app.close() })

describe('POST /v1/assistant/chat', () => {
  it('creates a session and returns a reply', async () => {
    const res = await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Hello, what can you do?' })
    expect(res.status).toBe(200)
    expect(res.body.sessionId).toBeDefined()
    expect(res.body.messageId).toBeDefined()
    expect(typeof res.body.reply).toBe('string')
    expect(Array.isArray(res.body.actions)).toBe(true)
  })

  it('reuses existing session when sessionId provided', async () => {
    const first = await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Hello' })
    const sessionId = first.body.sessionId as string

    const second = await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Follow up', sessionId })
    expect(second.body.sessionId).toBe(sessionId)

    const msgs = await db.select().from(chatMessages)
      .innerJoin(chatSessions, eq(chatSessions.id, chatMessages.sessionId))
      .where(eq(chatSessions.id, sessionId))
    expect(msgs.length).toBe(4) // 2 user + 2 assistant
  })
})

describe('GET /v1/assistant/sessions', () => {
  it('returns sessions for tenant', async () => {
    await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Hello' })
    const res = await supertest(app.server)
      .get('/v1/assistant/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.sessions.length).toBeGreaterThan(0)
    expect(res.body.sessions[0].title).toBeDefined()
  })
})

describe('POST /v1/assistant/apply', () => {
  it('executes actions and marks message applied', async () => {
    const chatRes = await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'create a rule' })

    // Patch the message's actions_json to use a safe action (create_subject needs no FK)
    await db.update(chatMessages)
      .set({ actionsJson: [{ op: 'create_subject', name: 'Applied Subject' }] })
      .where(eq(chatMessages.id, chatRes.body.messageId as string))

    const applyRes = await supertest(app.server)
      .post('/v1/assistant/apply')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ messageId: chatRes.body.messageId })
    expect(applyRes.status).toBe(200)
    expect(applyRes.body.applied.length).toBeGreaterThan(0)

    const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, chatRes.body.messageId as string))
    expect(msg?.appliedAt).not.toBeNull()
  })

  it('returns 404 for unknown messageId', async () => {
    const res = await supertest(app.server)
      .post('/v1/assistant/apply')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ messageId: '00000000-0000-0000-0000-000000000000' })
    expect(res.status).toBe(404)
  })

  it('returns 409 when message already applied', async () => {
    const chatRes = await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'create' })
    await db.update(chatMessages)
      .set({ actionsJson: [{ op: 'create_subject', name: 'S' }], appliedAt: new Date() })
      .where(eq(chatMessages.id, chatRes.body.messageId))
    const res = await supertest(app.server)
      .post('/v1/assistant/apply')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ messageId: chatRes.body.messageId })
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npm test -- --reporter=verbose tests/assistant.test.ts
```

Expected: FAIL — `Cannot find module` or route not registered.

- [ ] **Step 3: Create service.ts**

Create `backend/src/assistant/service.ts`:

```typescript
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/client.js'
import { chatSessions, chatMessages, teams, type ChatSession, type ChatMessage } from '../db/schema.js'
import { listDivisions } from '../divisions/service.js'
import { listSubjects } from '../subjects/service.js'
import { listAllActiveRules } from '../rules/service.js'
import { buildSystemPrompt, type TenantSnapshot } from './prompt.js'
import type { LlmService, Action } from './llm/interface.js'

async function fetchSnapshot(tenantId: string): Promise<TenantSnapshot> {
  const [divisions, allTeams, subjects, rules] = await Promise.all([
    listDivisions(tenantId),
    db.select().from(teams).where(eq(teams.tenantId, tenantId)),
    listSubjects(tenantId),
    listAllActiveRules(tenantId),
  ])
  return { divisions, teams: allTeams, subjects, rules }
}

export async function sendMessage(opts: {
  tenantId:  string
  memberId:  string | undefined
  sessionId: string | undefined
  message:   string
  llm:       LlmService
}): Promise<{ sessionId: string; messageId: string; reply: string; actions: Action[] }> {
  const { tenantId, memberId, message, llm } = opts
  let sessionId = opts.sessionId

  // Upsert session
  if (!sessionId) {
    const title = message.slice(0, 60)
    const [session] = await db.insert(chatSessions)
      .values({ tenantId, memberId: memberId ?? null, title })
      .returning()
    sessionId = session!.id
  }

  // Load last 20 messages for history
  const recentMessages = await db.select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(20)
  const history = recentMessages
    .reverse()
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // Build prompt + call LLM
  const snapshot     = await fetchSnapshot(tenantId)
  const systemPrompt = buildSystemPrompt(snapshot)
  const { reply, actions } = await llm.chat(systemPrompt, history, message)

  // Persist both turns
  await db.insert(chatMessages).values({ sessionId, role: 'user', content: message })
  const [assistantMsg] = await db.insert(chatMessages)
    .values({ sessionId, role: 'assistant', content: reply, actionsJson: actions })
    .returning()

  return { sessionId, messageId: assistantMsg!.id, reply, actions }
}

export async function getSessions(tenantId: string, memberId: string | undefined): Promise<ChatSession[]> {
  return db.select().from(chatSessions)
    .where(eq(chatSessions.tenantId, tenantId))
    .orderBy(desc(chatSessions.createdAt))
    .limit(50)
}

export async function getMessages(tenantId: string, sessionId: string): Promise<ChatMessage[]> {
  const [session] = await db.select().from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.tenantId, tenantId)))
  if (!session) return []
  return db.select().from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(chatMessages.createdAt)
}
```

- [ ] **Step 4: Create router.ts**

Create `backend/src/assistant/router.ts`:

```typescript
import type { FastifyInstance } from 'fastify'
import { eq, and, isNull } from 'drizzle-orm'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { db } from '../db/client.js'
import { chatMessages } from '../db/schema.js'
import { sendMessage, getSessions, getMessages } from './service.js'
import { executeActions } from './apply.js'
import type { LlmService } from './llm/interface.js'

async function makeLlmService(): Promise<LlmService> {
  if (process.env.LLM_PROVIDER === 'openai') {
    const { OpenAiLlmService } = await import('./llm/openai.js')
    return new OpenAiLlmService()
  }
  const { AnthropicLlmService } = await import('./llm/anthropic.js')
  return new AnthropicLlmService()
}

export async function assistantRouter(fastify: FastifyInstance): Promise<void> {
  const llm = await makeLlmService()

  fastify.post('/assistant/chat', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { message, sessionId } = req.body as { message: string; sessionId?: string }
    if (!message || typeof message !== 'string') {
      return reply.status(400).send({ error: 'message is required' })
    }
    const result = await sendMessage({
      tenantId:  req.tenant.id,
      memberId:  req.member?.id,
      sessionId,
      message,
      llm,
    })
    return result
  })

  fastify.post('/assistant/apply', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { messageId } = req.body as { messageId: string }
    const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!msg) return reply.status(404).send({ error: 'Message not found' })
    if (msg.appliedAt) return reply.status(409).send({ error: 'Already applied' })

    const actions = Array.isArray(msg.actionsJson) ? msg.actionsJson as Parameters<typeof executeActions>[1] : []
    const { applied, errors } = await executeActions(req.tenant.id, actions)

    await db.update(chatMessages)
      .set({ appliedAt: new Date() })
      .where(eq(chatMessages.id, messageId))

    return { applied, errors }
  })

  fastify.get('/assistant/sessions', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const sessions = await getSessions(req.tenant.id, req.member?.id)
    return { sessions }
  })

  fastify.get('/assistant/sessions/:id/messages', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const messages = await getMessages(req.tenant.id, id)
    if (!messages.length) return reply.status(404).send({ error: 'Session not found' })
    return { messages }
  })
}
```

- [ ] **Step 5: Register in app.ts**

In `backend/src/app.ts`, add the import and register call:

```typescript
import { assistantRouter } from './assistant/router.js'
```

And inside `buildApp()`, after the existing `void app.register(tenantsRouter, { prefix: '/v1' })` line:

```typescript
  void app.register(assistantRouter, { prefix: '/v1' })
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd backend && npm test -- --reporter=verbose tests/assistant.test.ts
```

Expected: all tests PASS (the LLM is mocked so no real API calls are made).

- [ ] **Step 7: Run the full test suite to check for regressions**

```bash
cd backend && npm test
```

Expected: all existing tests still pass.

- [ ] **Step 8: Commit**

```bash
cd backend && git add src/assistant/ src/app.ts tests/assistant.test.ts
git commit -m "feat(assistant): service, router, and app registration"
```

---

## Task 7: Admin API client + TypeScript types

**Files:**
- Modify: `admin/src/types.ts`
- Modify: `admin/src/api.ts`

- [ ] **Step 1: Add ChatSession and ChatMessage types to types.ts**

In `admin/src/types.ts`, append:

```typescript
export interface ChatSession {
  id:        string
  tenantId:  string
  memberId:  string | null
  title:     string
  createdAt: string
}

export interface ChatMessage {
  id:          string
  sessionId:   string
  role:        'user' | 'assistant'
  content:     string
  actionsJson: unknown[] | null
  appliedAt:   string | null
  createdAt:   string
}

export interface AssistantChatResponse {
  sessionId: string
  messageId: string
  reply:     string
  actions:   unknown[]
}

export interface AssistantApplyResponse {
  applied: unknown[]
  errors:  string[]
}
```

- [ ] **Step 2: Add assistant methods to api.ts**

Add the import at the top of `admin/src/api.ts`:

```typescript
import type {
  // ... existing imports ...
  ChatSession, ChatMessage, AssistantChatResponse, AssistantApplyResponse,
} from './types'
```

Then add an `assistant` property to the `api` object (after the last existing property):

```typescript
  assistant: {
    chat: (message: string, sessionId?: string) =>
      request<AssistantChatResponse>('POST', '/v1/assistant/chat', { message, sessionId }),
    apply: (messageId: string) =>
      request<AssistantApplyResponse>('POST', '/v1/assistant/apply', { messageId }),
    sessions: () =>
      request<{ sessions: ChatSession[] }>('GET', '/v1/assistant/sessions'),
    messages: (sessionId: string) =>
      request<{ messages: ChatMessage[] }>('GET', `/v1/assistant/sessions/${sessionId}/messages`),
  },
```

- [ ] **Step 3: Commit**

```bash
cd admin && git add src/types.ts src/api.ts
git commit -m "feat(assistant): admin API client + types"
```

---

## Task 8: Frontend hooks

**Files:**
- Create: `admin/src/hooks/useAssistant.ts`

- [ ] **Step 1: Create the hooks file**

Create `admin/src/hooks/useAssistant.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import type { ChatMessage, ChatSession } from '../types'

export function useAssistantSessions() {
  return useQuery({
    queryKey: ['assistant-sessions'],
    queryFn: () => api.assistant.sessions().then(r => r.sessions),
  })
}

export function useAssistantMessages(sessionId: string | null) {
  return useQuery({
    queryKey: ['assistant-messages', sessionId],
    queryFn:  () => api.assistant.messages(sessionId!).then(r => r.messages),
    enabled:  !!sessionId,
  })
}

export function useAssistantChat() {
  const qc = useQueryClient()
  const [sessionId, setSessionId] = useState<string | null>(null)

  const send = useMutation({
    mutationFn: ({ message }: { message: string }) =>
      api.assistant.chat(message, sessionId ?? undefined),
    onSuccess: (data) => {
      if (!sessionId) setSessionId(data.sessionId)
      qc.invalidateQueries({ queryKey: ['assistant-messages', data.sessionId] })
      qc.invalidateQueries({ queryKey: ['assistant-sessions'] })
    },
  })

  const startNewSession = () => setSessionId(null)
  const switchSession   = (id: string) => setSessionId(id)

  return { send, sessionId, startNewSession, switchSession }
}

export function useApplyActions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (messageId: string) => api.assistant.apply(messageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects'] })
      qc.invalidateQueries({ queryKey: ['rules'] })
      qc.invalidateQueries({ queryKey: ['assistant-messages'] })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
cd admin && git add src/hooks/useAssistant.ts
git commit -m "feat(assistant): TanStack Query hooks for chat, sessions, and apply"
```

---

## Task 9: Frontend components

**Files:**
- Create: `admin/src/components/assistant/ActionItem.tsx`
- Create: `admin/src/components/assistant/PreviewPane.tsx`
- Create: `admin/src/components/assistant/MessageBubble.tsx`
- Create: `admin/src/components/assistant/ChatInput.tsx`
- Create: `admin/src/components/assistant/SessionTabs.tsx`
- Create: `admin/src/components/assistant/ChatPane.tsx`

- [ ] **Step 1: Create ActionItem.tsx**

Create `admin/src/components/assistant/ActionItem.tsx`:

```tsx
interface ActionItemProps {
  action: Record<string, unknown>
}

const OP_COLOR: Record<string, { bg: string; border: string; text: string; label: string }> = {
  create_rule:    { bg: '#1a2a1a', border: '#2a3a2a', text: '#4caf50', label: '+ CREATE RULE' },
  update_rule:    { bg: '#1a1a2a', border: '#2a2a3a', text: '#2196f3', label: '~ UPDATE RULE' },
  delete_rule:    { bg: '#2a1a1a', border: '#3a2a2a', text: '#f44336', label: '− DELETE RULE' },
  create_subject: { bg: '#1a2a1a', border: '#2a3a2a', text: '#4caf50', label: '+ CREATE SUBJECT' },
  update_subject: { bg: '#1a1a2a', border: '#2a2a3a', text: '#2196f3', label: '~ UPDATE SUBJECT' },
  delete_subject: { bg: '#2a1a1a', border: '#3a2a2a', text: '#f44336', label: '− DELETE SUBJECT' },
}

export function ActionItem({ action }: ActionItemProps) {
  const op     = action.op as string
  const colors = OP_COLOR[op] ?? { bg: 'var(--bg-surface-raised)', border: 'var(--border)', text: 'var(--text-muted)', label: op }
  const fields = Object.entries(action).filter(([k]) => k !== 'op')

  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
      <div style={{ background: colors.bg, padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: colors.text, fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>{colors.label}</span>
      </div>
      <div style={{ padding: '8px 12px' }}>
        {fields.map(([key, value]) => (
          <div key={key} style={{ fontSize: 11, fontFamily: 'monospace', marginBottom: 2 }}>
            <span style={{ color: 'var(--text-primary)' }}>{key}:</span>{' '}
            <span style={{ color: 'var(--text-muted)' }}>
              {typeof value === 'string' ? value : JSON.stringify(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create PreviewPane.tsx**

Create `admin/src/components/assistant/PreviewPane.tsx`:

```tsx
import { ActionItem } from './ActionItem'

interface PreviewPaneProps {
  actions:     unknown[]
  messageId:   string | null
  onApply:     (messageId: string) => void
  onDiscard:   () => void
  isApplying:  boolean
}

export function PreviewPane({ actions, messageId, onApply, onDiscard, isApplying }: PreviewPaneProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Proposed Changes</span>
        {actions.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-surface-raised)',
                         border: '1px solid var(--border)', borderRadius: 10, padding: '1px 7px' }}>
            {actions.length} action{actions.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: actions.length ? '12px 16px' : 0 }}>
        {actions.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: '100%', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
            Proposed changes will appear here after the assistant responds.
          </div>
        ) : (
          actions.map((action, i) => (
            <ActionItem key={i} action={action as Record<string, unknown>} />
          ))
        )}
      </div>

      {actions.length > 0 && messageId && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)',
                      background: 'var(--bg-surface)', display: 'flex', gap: 8 }}>
          <button
            onClick={() => onApply(messageId)}
            disabled={isApplying}
            style={{
              flex: 1, background: 'var(--brand-primary)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 0', fontSize: 12, fontWeight: 600,
              cursor: isApplying ? 'not-allowed' : 'pointer', opacity: isApplying ? 0.7 : 1,
            }}
          >
            {isApplying ? 'Applying…' : 'Apply Changes'}
          </button>
          <button
            onClick={onDiscard}
            style={{
              background: 'var(--bg-surface-raised)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            Discard
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create MessageBubble.tsx**

Create `admin/src/components/assistant/MessageBubble.tsx`:

```tsx
import type { ChatMessage } from '../../types'

interface MessageBubbleProps {
  message:   ChatMessage
  isLatest:  boolean
  isPending: boolean
}

export function MessageBubble({ message, isLatest, isPending }: MessageBubbleProps) {
  const isUser      = message.role === 'user'
  const hasActions  = Array.isArray(message.actionsJson) && message.actionsJson.length > 0
  const isApplied   = !!message.appliedAt

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        background: isUser ? 'var(--bg-surface-raised)' : 'var(--brand-primary)',
        border: isUser ? '1px solid var(--border)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 10,
      }}>
        {!isUser && '✦'}
      </div>
      <div style={{ maxWidth: '80%' }}>
        <div style={{
          background: isUser ? 'var(--brand-primary)' : 'var(--bg-surface-raised)',
          border: isUser ? 'none' : '1px solid var(--border)',
          borderRadius: 8,
          borderTopLeftRadius: isUser ? 8 : 2,
          borderTopRightRadius: isUser ? 2 : 8,
          padding: '8px 12px',
        }}>
          <span style={{ color: isUser ? '#fff' : 'var(--text-primary)', fontSize: 12, lineHeight: 1.5 }}>
            {message.content}
          </span>
        </div>
        {hasActions && (
          <div style={{
            marginTop: 4, fontSize: 10, color: isApplied ? '#4caf50' : 'var(--brand-primary)',
            background: 'var(--bg-surface-raised)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '3px 8px', display: 'inline-block',
          }}>
            {isApplied
              ? `✓ Applied ${(message.actionsJson as unknown[]).length} change(s)`
              : `📋 ${(message.actionsJson as unknown[]).length} proposed change(s) → review in preview pane`}
          </div>
        )}
        {isPending && (
          <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>Thinking…</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create ChatInput.tsx**

Create `admin/src/components/assistant/ChatInput.tsx`:

```tsx
import { useState, useRef, type KeyboardEvent } from 'react'

interface ChatInputProps {
  onSend:    (message: string) => void
  disabled:  boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  function submit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder="Describe what you want to change… (Enter to send, Shift+Enter for newline)"
          rows={2}
          style={{
            flex: 1, background: 'var(--bg-surface-raised)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--text-primary)',
            resize: 'none', fontFamily: 'inherit', lineHeight: 1.4,
            opacity: disabled ? 0.6 : 1,
          }}
        />
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          style={{
            background: 'var(--brand-primary)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '10px 16px', fontSize: 12, fontWeight: 600,
            cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
            opacity: disabled || !value.trim() ? 0.6 : 1, flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create SessionTabs.tsx**

Create `admin/src/components/assistant/SessionTabs.tsx`:

```tsx
import type { ChatSession } from '../../types'

interface SessionTabsProps {
  sessions:         ChatSession[]
  activeSessionId:  string | null
  onSelect:         (id: string) => void
  onNew:            () => void
}

export function SessionTabs({ sessions, activeSessionId, onSelect, onNew }: SessionTabsProps) {
  return (
    <div style={{
      borderBottom: '1px solid var(--border)', padding: '6px 12px',
      background: 'var(--bg-surface)', display: 'flex', gap: 6, overflowX: 'auto',
      alignItems: 'center',
    }}>
      <button
        onClick={onNew}
        style={{
          background: 'none', border: '1px dashed var(--border)', borderRadius: 6,
          padding: '3px 10px', fontSize: 10, color: 'var(--text-muted)',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        + New chat
      </button>
      {sessions.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          style={{
            background: s.id === activeSessionId ? 'var(--brand-primary)' : 'var(--bg-surface-raised)',
            color:      s.id === activeSessionId ? '#fff' : 'var(--text-muted)',
            border:     s.id === activeSessionId ? 'none' : '1px solid var(--border)',
            borderRadius: 6, padding: '3px 10px', fontSize: 10,
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          title={s.title}
        >
          {s.title}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Create ChatPane.tsx**

Create `admin/src/components/assistant/ChatPane.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import type { ChatMessage, ChatSession } from '../../types'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { SessionTabs } from './SessionTabs'

interface ChatPaneProps {
  sessions:        ChatSession[]
  messages:        ChatMessage[]
  activeSessionId: string | null
  isSending:       boolean
  onSend:          (message: string) => void
  onSelectSession: (id: string) => void
  onNewSession:    () => void
  pendingMessageId: string | null
}

export function ChatPane({
  sessions, messages, activeSessionId, isSending,
  onSend, onSelectSession, onNewSession, pendingMessageId,
}: ChatPaneProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isSending])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', minWidth: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Assistant</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>mykka AI policy manager</span>
      </div>

      <SessionTabs
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={onSelectSession}
        onNew={onNewSession}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !isSending && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 32 }}>
            Start by describing a rule or policy change you'd like to make.
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLatest={i === messages.length - 1}
            isPending={false}
          />
        ))}
        {isSending && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10 }}>✦</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Thinking…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <ChatInput onSend={onSend} disabled={isSending} />
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
cd admin && git add src/components/assistant/
git commit -m "feat(assistant): chat pane, preview pane, and sub-components"
```

---

## Task 10: AssistantPage, route, and nav

**Files:**
- Create: `admin/src/pages/AssistantPage.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Create AssistantPage.tsx**

Create `admin/src/pages/AssistantPage.tsx`:

```tsx
import { useState } from 'react'
import { ChatPane } from '../components/assistant/ChatPane'
import { PreviewPane } from '../components/assistant/PreviewPane'
import { useAssistantSessions, useAssistantMessages, useAssistantChat, useApplyActions } from '../hooks/useAssistant'
import type { ChatMessage } from '../types'

export function AssistantPage() {
  const { data: sessionsData }           = useAssistantSessions()
  const { send, sessionId, startNewSession, switchSession } = useAssistantChat()
  const { data: messagesData }           = useAssistantMessages(sessionId)
  const applyMutation                    = useApplyActions()

  // Track the most recent assistant message with unapplied actions
  const messages: ChatMessage[] = messagesData?.messages ?? []
  const latestAssistantMsg = [...messages].reverse().find(
    m => m.role === 'assistant' && Array.isArray(m.actionsJson) && m.actionsJson.length > 0 && !m.appliedAt
  ) ?? null

  const [discarded, setDiscarded] = useState<string | null>(null)
  const pendingMsg = latestAssistantMsg?.id !== discarded ? latestAssistantMsg : null

  function handleSend(message: string) {
    setDiscarded(null)
    send.mutate({ message })
  }

  function handleApply(messageId: string) {
    applyMutation.mutate(messageId)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <ChatPane
        sessions={sessionsData?.sessions ?? []}
        messages={messages}
        activeSessionId={sessionId}
        isSending={send.isPending}
        onSend={handleSend}
        onSelectSession={(id) => { switchSession(id); setDiscarded(null) }}
        onNewSession={() => { startNewSession(); setDiscarded(null) }}
        pendingMessageId={pendingMsg?.id ?? null}
      />
      <PreviewPane
        actions={pendingMsg?.actionsJson ?? []}
        messageId={pendingMsg?.id ?? null}
        onApply={handleApply}
        onDiscard={() => setDiscarded(latestAssistantMsg?.id ?? null)}
        isApplying={applyMutation.isPending}
      />
    </div>
  )
}
```

- [ ] **Step 2: Add route to App.tsx**

In `admin/src/App.tsx`, add the import:

```tsx
import { AssistantPage } from './pages/AssistantPage'
```

Inside the `<Routes>` block (after the `audit` route), add:

```tsx
<Route path="/assistant" element={<AssistantPage />} />
```

- [ ] **Step 3: Add nav item to AppLayout.tsx**

In `admin/src/components/layout/AppLayout.tsx`, update the `NAV` array to include the Assistant entry. Add it between Audit Log and Settings:

```typescript
const NAV = [
  { to: '/dashboard',  label: 'Dashboard',  icon: '▦' },
  { to: '/subjects',   label: 'Policies',   icon: '⊡' },
  { to: '/org',        label: 'Teams',      icon: '⊞' },
  { to: '/members',    label: 'Members',    icon: '◎' },
  { to: '/audit',      label: 'Audit Log',  icon: '≡' },
  { to: '/assistant',  label: 'Assistant',  icon: '✦' },
  { to: '/settings',   label: 'Settings',   icon: '⚙' },
]
```

- [ ] **Step 4: Start the admin dev server and verify the page loads**

In a terminal:
```bash
cd admin && npm run dev
```

Open http://localhost:5173 (or the port shown), sign in, and click "Assistant" in the sidebar. Expected: the page loads with a 50/50 split — empty chat pane on the left, empty preview pane on the right. The session tabs strip and input box are visible.

- [ ] **Step 5: Smoke test the chat flow**

With the backend running (`cd backend && npm run dev`), type a message in the chat input and press Enter. Expected:
- "Thinking…" indicator appears while the request is in-flight
- The assistant reply appears as a bubble on the left
- If the LLM returned actions, they appear in the preview pane with Apply/Discard buttons
- Clicking Apply removes the actions from preview and shows "Applied ✓" badge on the message bubble

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/AssistantPage.tsx admin/src/App.tsx admin/src/components/layout/AppLayout.tsx
git commit -m "feat(assistant): AssistantPage, /assistant route, and sidebar nav entry"
```
