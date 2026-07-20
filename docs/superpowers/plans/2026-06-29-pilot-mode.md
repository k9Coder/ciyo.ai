# Pilot Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `pilot` plan with per-day assistant prompt limits, a one-env-var pilot mode toggle that freezes billing and auto-provisions all new tenants on the pilot plan, and hide pricing on the marketing site when pilot mode is active.

**Architecture:** `PLAN_LIMITS` in `billing/limits.ts` is the single source of truth for all feature gates — extending it with `assistantMaximumTokens` and `assistantPromptsADay` means every consumer (router, console, status API) picks up limits automatically. Pilot mode is activated per-package via environment variables (`PILOT_MODE` on backend, `NEXT_PUBLIC_PILOT_MODE` on mykka-web); no database migrations are needed because the `plan` column is free-text. The console hides billing UI when the plan returned from the API is `pilot` — no extra env var required there.

**Tech Stack:** Fastify + TypeScript (backend), Drizzle ORM (DB access), React (pretzel-console), Next.js (mykka-web), Vitest (unit tests)

## Responsible Personnel

| Action | Owner |
|--------|-------|
| Merge & deploy | Marcus Webb (CTO) |
| Set `PILOT_MODE=true` on Render (backend) | Ryan Kowalski (DevOps) |
| Set `NEXT_PUBLIC_PILOT_MODE=true` on Vercel (mykka-web) | Ryan Kowalski (DevOps) |
| Decide when to enter / exit pilot | Ethan Cole (CEO) + Marcus Webb |
| QA sign-off | Natasha Ivanova (QA) |

## Global Constraints

- `-1` means unlimited / don't-care for all numeric plan limit fields.
- TypeScript strict mode — no `any`, no implicit `undefined` returns.
- No DB schema changes — `plan` column is `text`, `'pilot'` is just a new string value.
- Do not break existing plan behaviour for `free`, `starter`, `business`, `enterprise`.
- All backend changes live in the `backend/` package; run `pnpm typecheck` from there to verify.
- All console changes live in `pretzel-console/`; run `pnpm typecheck` from there.
- All mykka-web changes live in `mykka-web/`; run `pnpm build` from there.
- Tests use Vitest; run `pnpm test` from the relevant package root.

---

## File Map

| File | Action | Reason |
|------|--------|--------|
| `backend/src/billing/limits.ts` | Modify | Add `assistantMaximumTokens`, `assistantPromptsADay` to `PlanLimits`; add `'pilot'` to `Plan`; populate all existing plans with new fields; add `pilot` entry |
| `backend/src/billing/limits.test.ts` | Create | Unit tests for new plan limits fields and pilot plan values |
| `backend/src/billing/service.ts` | Modify | Add `'pilot'` to `ActivateInput.plan` union |
| `backend/src/billing/router.ts` | Modify | Add `assistantPromptsADay`, `assistantMaximumTokens`, `assistantPromptsUsedToday` to `/billing/status` response |
| `backend/src/assistant/llm/interface.ts` | Modify | Add optional `opts?: { maxTokens?: number }` to `LlmService.chat()` |
| `backend/src/assistant/llm/anthropic.ts` | Modify | Pass `opts.maxTokens ?? 2048` to API call |
| `backend/src/assistant/llm/openai.ts` | Modify | Pass `opts.maxTokens ?? 2048` to API call |
| `backend/src/assistant/llm/groq.ts` | Modify | Pass `opts.maxTokens ?? 2048` to API call |
| `backend/src/assistant/router.ts` | Modify | Enforce `assistantPromptsADay` before calling LLM; pass `assistantMaximumTokens` as `maxTokens` |
| `backend/src/webhooks/clerk.ts` | Modify | Auto-provision on `'pilot'` when `PILOT_MODE=true`, else `'free'` |
| `mykka-web/lib/config.ts` | Modify | Export `IS_PILOT_MODE` from `NEXT_PUBLIC_PILOT_MODE` env var |
| `mykka-web/app/pricing/PricingClient.tsx` | Modify | When `IS_PILOT_MODE`, render pilot banner instead of pricing grid |
| `pretzel-console/src/pages/SettingsPage.tsx` | Modify | Hide Billing section when `billing?.plan === 'pilot'` |

---

## Task 1: Extend PlanLimits + add pilot plan

**Files:**
- Modify: `backend/src/billing/limits.ts`
- Create: `backend/src/billing/limits.test.ts`

**Interfaces:**
- Produces: `Plan` (now includes `'pilot'`), `PlanLimits` (now has `assistantMaximumTokens: number` and `assistantPromptsADay: number`), `PLAN_LIMITS['pilot']` entry

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/billing/limits.test.ts
import { describe, it, expect } from 'vitest'
import {
  PLAN_LIMITS,
  isOverScanLimit,
  isOverSeatLimit,
  getScanLimit,
  getSeatLimit,
} from './limits.js'

describe('PlanLimits — new fields exist on all plans', () => {
  const plans = ['free', 'starter', 'business', 'enterprise', 'pilot'] as const

  it.each(plans)('%s has assistantMaximumTokens', (plan) => {
    expect(typeof PLAN_LIMITS[plan].assistantMaximumTokens).toBe('number')
  })

  it.each(plans)('%s has assistantPromptsADay', (plan) => {
    expect(typeof PLAN_LIMITS[plan].assistantPromptsADay).toBe('number')
  })
})

describe('pilot plan limits', () => {
  const pilot = PLAN_LIMITS['pilot']

  it('has unlimited seats', () => {
    expect(pilot.maxSeats).toBe(-1)
  })
  it('has unlimited monthly scans', () => {
    expect(pilot.monthlyScans).toBe(-1)
  })
  it('has assistant enabled', () => {
    expect(pilot.assistantEnabled).toBe(true)
  })
  it('has advanced analytics', () => {
    expect(pilot.advancedAnalytics).toBe(true)
  })
  it('allows all rule kinds', () => {
    expect(pilot.allowedRuleKinds).toEqual(['keyword', 'pattern', 'entropy', 'score'])
  })
  it('has 5 prompts per day', () => {
    expect(pilot.assistantPromptsADay).toBe(5)
  })
  it('has unlimited tokens (-1)', () => {
    expect(pilot.assistantMaximumTokens).toBe(-1)
  })
})

describe('existing plans are not broken', () => {
  it('free: maxSeats=3, assistantEnabled=false', () => {
    expect(PLAN_LIMITS['free'].maxSeats).toBe(3)
    expect(PLAN_LIMITS['free'].assistantEnabled).toBe(false)
    expect(PLAN_LIMITS['free'].assistantPromptsADay).toBe(-1)
    expect(PLAN_LIMITS['free'].assistantMaximumTokens).toBe(-1)
  })
  it('business: assistantEnabled=true, unlimited prompts', () => {
    expect(PLAN_LIMITS['business'].assistantEnabled).toBe(true)
    expect(PLAN_LIMITS['business'].assistantPromptsADay).toBe(-1)
  })
})

describe('limit helpers work with pilot', () => {
  it('isOverScanLimit returns false for pilot at any count', () => {
    expect(isOverScanLimit('pilot', 1_000_000)).toBe(false)
  })
  it('isOverSeatLimit returns false for pilot at any count', () => {
    expect(isOverSeatLimit('pilot', 1_000)).toBe(false)
  })
  it('getScanLimit returns -1 for pilot', () => {
    expect(getScanLimit('pilot')).toBe(-1)
  })
  it('getSeatLimit returns -1 for pilot', () => {
    expect(getSeatLimit('pilot')).toBe(-1)
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```powershell
cd backend
pnpm test -- --reporter=verbose src/billing/limits.test.ts
```

Expected: `Cannot find name 'pilot'` or similar type errors plus assertion failures.

- [ ] **Step 3: Implement the changes**

Replace `backend/src/billing/limits.ts` entirely:

```typescript
export type Plan = 'free' | 'starter' | 'business' | 'enterprise' | 'pilot'

export interface PlanLimits {
  maxSeats:               number    // -1 = unlimited
  monthlyScans:           number    // -1 = unlimited
  allowedRuleKinds:       ReadonlyArray<'keyword' | 'pattern' | 'entropy' | 'score'>
  assistantEnabled:       boolean
  assistantPromptsADay:   number    // -1 = unlimited
  assistantMaximumTokens: number    // -1 = use LLM default
  advancedAnalytics:      boolean
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxSeats:               3,
    monthlyScans:           500,
    allowedRuleKinds:       ['keyword'],
    assistantEnabled:       false,
    assistantPromptsADay:   -1,
    assistantMaximumTokens: -1,
    advancedAnalytics:      false,
  },
  starter: {
    maxSeats:               25,
    monthlyScans:           50_000,
    allowedRuleKinds:       ['keyword', 'pattern'],
    assistantEnabled:       false,
    assistantPromptsADay:   -1,
    assistantMaximumTokens: -1,
    advancedAnalytics:      false,
  },
  business: {
    maxSeats:               -1,
    monthlyScans:           -1,
    allowedRuleKinds:       ['keyword', 'pattern', 'entropy', 'score'],
    assistantEnabled:       true,
    assistantPromptsADay:   -1,
    assistantMaximumTokens: -1,
    advancedAnalytics:      true,
  },
  enterprise: {
    maxSeats:               -1,
    monthlyScans:           -1,
    allowedRuleKinds:       ['keyword', 'pattern', 'entropy', 'score'],
    assistantEnabled:       true,
    assistantPromptsADay:   -1,
    assistantMaximumTokens: -1,
    advancedAnalytics:      true,
  },
  pilot: {
    maxSeats:               -1,
    monthlyScans:           -1,
    allowedRuleKinds:       ['keyword', 'pattern', 'entropy', 'score'],
    assistantEnabled:       true,
    assistantPromptsADay:   5,
    assistantMaximumTokens: -1,
    advancedAnalytics:      true,
  },
}

export function isOverScanLimit(plan: Plan, monthlyScans: number): boolean {
  const limit = PLAN_LIMITS[plan]?.monthlyScans ?? 500
  return limit !== -1 && monthlyScans >= limit
}

export function isOverSeatLimit(plan: Plan, currentSeats: number): boolean {
  const limit = PLAN_LIMITS[plan]?.maxSeats ?? 3
  return limit !== -1 && currentSeats >= limit
}

export function isRuleKindAllowed(plan: Plan, kind: string): boolean {
  const kinds = PLAN_LIMITS[plan]?.allowedRuleKinds ?? ['keyword']
  return (kinds as string[]).includes(kind)
}

export function getScanLimit(plan: Plan): number {
  return PLAN_LIMITS[plan]?.monthlyScans ?? 500
}

export function getSeatLimit(plan: Plan): number {
  return PLAN_LIMITS[plan]?.maxSeats ?? 3
}
```

- [ ] **Step 4: Run tests — expect pass**

```powershell
cd backend
pnpm test -- --reporter=verbose src/billing/limits.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Typecheck backend**

```powershell
cd backend
pnpm typecheck
```

Expected: zero errors. If errors appear about `Plan` usage (e.g. in `billing/service.ts`), fix them in Task 2.

- [ ] **Step 6: Commit**

```powershell
git add backend/src/billing/limits.ts backend/src/billing/limits.test.ts
git commit -m "feat(billing): add pilot plan with assistantPromptsADay + assistantMaximumTokens limits"
```

---

## Task 2: Thread maxTokens through LLM services

**Files:**
- Modify: `backend/src/assistant/llm/interface.ts`
- Modify: `backend/src/assistant/llm/anthropic.ts`
- Modify: `backend/src/assistant/llm/openai.ts`
- Modify: `backend/src/assistant/llm/groq.ts`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces: `LlmService.chat(systemPrompt, history, userMessage, opts?)` where `opts?: { maxTokens?: number }`

- [ ] **Step 1: Update the interface**

Replace `backend/src/assistant/llm/interface.ts`:

```typescript
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

export interface LlmChatOptions {
  maxTokens?: number
}

export interface LlmService {
  chat(systemPrompt: string, history: LlmMessage[], userMessage: string, opts?: LlmChatOptions): Promise<LlmResponse>
}
```

- [ ] **Step 2: Update Anthropic implementation**

Replace `backend/src/assistant/llm/anthropic.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { LlmService, LlmMessage, LlmResponse, LlmChatOptions, Action } from './interface.js'

export class AnthropicLlmService implements LlmService {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async chat(systemPrompt: string, history: LlmMessage[], userMessage: string, opts?: LlmChatOptions): Promise<LlmResponse> {
    const messages: Anthropic.MessageParam[] = [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const response = await this.client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: opts?.maxTokens ?? 2048,
      system:     systemPrompt,
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

- [ ] **Step 3: Update OpenAI implementation**

Replace `backend/src/assistant/llm/openai.ts`:

```typescript
import OpenAI from 'openai'
import type { LlmService, LlmMessage, LlmResponse, LlmChatOptions, Action } from './interface.js'

export class OpenAiLlmService implements LlmService {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  async chat(systemPrompt: string, history: LlmMessage[], userMessage: string, opts?: LlmChatOptions): Promise<LlmResponse> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const response = await this.client.chat.completions.create({
      model:           'gpt-4o',
      max_tokens:      opts?.maxTokens ?? 2048,
      messages,
      response_format: { type: 'json_object' },
    })

    const text = response.choices[0]?.message?.content ?? ''
    return parseResponse(text)
  }
}

export function parseResponse(text: string): LlmResponse {
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

- [ ] **Step 4: Update Groq implementation**

Replace `backend/src/assistant/llm/groq.ts`:

```typescript
import OpenAI from 'openai'
import type { LlmService, LlmMessage, LlmResponse, LlmChatOptions } from './interface.js'
import { parseResponse } from './openai.js'

export class GroqLlmService implements LlmService {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({
      apiKey:  process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  }

  async chat(systemPrompt: string, history: LlmMessage[], userMessage: string, opts?: LlmChatOptions): Promise<LlmResponse> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const response = await this.client.chat.completions.create({
      model:           'llama-3.3-70b-versatile',
      max_tokens:      opts?.maxTokens ?? 2048,
      messages,
      response_format: { type: 'json_object' },
    })

    const text = response.choices[0]?.message?.content ?? ''
    return parseResponse(text)
  }
}
```

- [ ] **Step 5: Typecheck**

```powershell
cd backend
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```powershell
git add backend/src/assistant/llm/
git commit -m "feat(assistant): thread maxTokens option through LlmService.chat()"
```

---

## Task 3: Enforce assistantPromptsADay in the assistant router

**Files:**
- Modify: `backend/src/assistant/router.ts`

**Interfaces:**
- Consumes: `PLAN_LIMITS[plan].assistantPromptsADay`, `PLAN_LIMITS[plan].assistantMaximumTokens` from Task 1; `LlmChatOptions` from Task 2
- Produces: HTTP 429 with `{ error: '...', promptsUsedToday: N, limit: N }` when daily limit exceeded

Note: Prompt counting joins `chatMessages` (role = `'user'`) with `chatSessions` (tenantId) for today UTC. This query must run **before** `sendMessage` is called.

- [ ] **Step 1: Update assistant router**

Replace `backend/src/assistant/router.ts`:

```typescript
import type { FastifyInstance } from 'fastify'
import { and, count, eq, gte } from 'drizzle-orm'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { db } from '../db/client.js'
import { chatMessages, chatSessions, type SubjectVersion } from '../db/schema.js'
import { subjectsClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
import { sendMessage, getSessions, getMessages } from './service.js'
import { executeActions } from './apply.js'
import { resolveAffectedSubjectIds } from './versioning.js'
import { snapshotSubject } from '../subjects/snapshot.js'
import { PLAN_LIMITS, type Plan } from '../billing/limits.js'
import type { LlmService, Action } from './llm/interface.js'

async function makeLlmService(): Promise<LlmService> {
  if (process.env.LLM_PROVIDER === 'openai') {
    const { OpenAiLlmService } = await import('./llm/openai.js')
    return new OpenAiLlmService()
  }
  if (process.env.LLM_PROVIDER === 'groq') {
    const { GroqLlmService } = await import('./llm/groq.js')
    return new GroqLlmService()
  }
  const { AnthropicLlmService } = await import('./llm/anthropic.js')
  return new AnthropicLlmService()
}

async function countPromptsUsedToday(tenantId: string): Promise<number> {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const [row] = await db
    .select({ n: count() })
    .from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
    .where(and(
      eq(chatSessions.tenantId, tenantId),
      eq(chatMessages.role, 'user'),
      gte(chatMessages.createdAt, todayStart),
    ))
  return row?.n ?? 0
}

export { countPromptsUsedToday }

export async function assistantRouter(fastify: FastifyInstance): Promise<void> {
  const llm = await makeLlmService()

  fastify.post('/assistant/chat', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const plan   = req.tenant.plan as Plan
    const limits = PLAN_LIMITS[plan]

    if (!limits?.assistantEnabled) {
      return reply.status(402).send({
        error: 'The AI Assistant is available on the Business plan. Upgrade to access it.',
      })
    }

    if (limits.assistantPromptsADay !== -1) {
      const used = await countPromptsUsedToday(req.tenant.id)
      if (used >= limits.assistantPromptsADay) {
        return reply.status(429).send({
          error: `Daily assistant limit reached (${limits.assistantPromptsADay} prompts/day). Resets at midnight UTC.`,
          promptsUsedToday: used,
          limit: limits.assistantPromptsADay,
        })
      }
    }

    const { message, sessionId } = req.body as { message: string; sessionId?: string }
    if (!message || typeof message !== 'string') {
      return reply.status(400).send({ error: 'message is required' })
    }

    const maxTokens = limits.assistantMaximumTokens !== -1 ? limits.assistantMaximumTokens : undefined

    return sendMessage({ tenantId: req.tenant.id, memberId: req.member?.id, sessionId, message, llm, maxTokens })
  })

  fastify.post('/assistant/apply', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { messageId } = req.body as { messageId: string }

    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id

    const [row] = await db
      .select({ msg: chatMessages })
      .from(chatMessages)
      .innerJoin(chatSessions, and(
        eq(chatMessages.sessionId, chatSessions.id),
        eq(chatSessions.tenantId, req.tenant.id),
      ))
      .where(eq(chatMessages.id, messageId))
    const msg = row?.msg
    if (!msg) return reply.status(404).send({ error: 'Message not found' })
    if (msg.appliedAt) return reply.status(409).send({ error: 'Already applied' })

    const actions = Array.isArray(msg.actionsJson)
      ? (msg.actionsJson as Action[])
      : []

    const affectedIds = await resolveAffectedSubjectIds(req.tenant.id, actions)
    await Promise.all(
      affectedIds.map(id => snapshotSubject(req.tenant.id, id, 'pre_ai_apply', messageId))
    )

    const { applied, errors } = await executeActions(req.tenant.id, actions)
    await db.update(chatMessages).set({ appliedAt: new Date() }).where(eq(chatMessages.id, messageId))

    return { applied, errors }
  })

  fastify.post('/assistant/messages/:messageId/revert', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { messageId } = req.params as { messageId: string }

    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id

    const versionsRes = await subjectsClient.get<SubjectVersion[]>('/versions', {
      params: { conversationMsgId: messageId },
    })
    const versions = versionsRes.data

    if (!versions.length) return reply.status(404).send({ error: 'No revertible changes found for this message' })

    for (const ver of versions) {
      if (ver.tenantId !== req.tenant.id) return reply.status(403).send({ error: 'Forbidden' })
      await subjectsClient.post(`/${ver.subjectId}/revert-snapshot`, { snapshot: ver.snapshot })
    }

    return { reverted: versions.length }
  })

  fastify.get('/assistant/sessions', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    return { sessions: await getSessions(req.tenant.id) }
  })

  fastify.get('/assistant/sessions/:id/messages', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const messages = await getMessages(req.tenant.id, id)
    if (!messages.length) return reply.status(404).send({ error: 'Session not found' })

    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id

    const assistantMsgIds = messages
      .filter(m => m.role === 'assistant' && m.appliedAt)
      .map(m => m.id)

    const snapshotMsgIds = new Set<string>()
    if (assistantMsgIds.length > 0) {
      const res = await subjectsClient.get<{ ids: string[] }>('/versions/has-snapshots', {
        params: { messageIds: assistantMsgIds.join(',') },
      })
      for (const sid of res.data.ids) snapshotMsgIds.add(sid)
    }

    return {
      messages: messages.map(m => ({
        ...m,
        hasVersionSnapshot: snapshotMsgIds.has(m.id),
      })),
    }
  })
}
```

- [ ] **Step 2: Update sendMessage to accept maxTokens**

The current `sendMessage` in `backend/src/assistant/service.ts` calls `llm.chat(systemPrompt, history, message)` without opts. Update the function signature and call site.

Open `backend/src/assistant/service.ts` and change:

```typescript
// old signature (line 29-35):
export async function sendMessage(opts: {
  tenantId:  string
  memberId:  string | undefined
  sessionId: string | undefined
  message:   string
  llm:       LlmService
}): Promise<{ sessionId: string; messageId: string; reply: string; actions: Action[] }> {
```

to:

```typescript
export async function sendMessage(opts: {
  tenantId:  string
  memberId:  string | undefined
  sessionId: string | undefined
  message:   string
  llm:       LlmService
  maxTokens?: number
}): Promise<{ sessionId: string; messageId: string; reply: string; actions: Action[] }> {
```

And change the `llm.chat` call at line 58 from:

```typescript
  const { reply, actions } = await llm.chat(systemPrompt, history, message)
```

to:

```typescript
  const { reply, actions } = await llm.chat(systemPrompt, history, message, opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : undefined)
```

- [ ] **Step 3: Typecheck**

```powershell
cd backend
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```powershell
git add backend/src/assistant/
git commit -m "feat(assistant): enforce assistantPromptsADay limit and thread maxTokens to LLM"
```

---

## Task 4: Expose assistant limits in billing status + add pilot to service types

**Files:**
- Modify: `backend/src/billing/router.ts`
- Modify: `backend/src/billing/service.ts`

**Interfaces:**
- Consumes: `countPromptsUsedToday` exported from Task 3; `PLAN_LIMITS` from Task 1
- Produces: `/billing/status` response now includes `assistantLimits: { promptsPerDay: number; promptsUsedToday: number; maximumTokens: number }`

- [ ] **Step 1: Add `'pilot'` to service.ts ActivateInput**

In `backend/src/billing/service.ts` line 17, change:

```typescript
  plan:             'free' | 'starter' | 'business' | 'enterprise'
```

to:

```typescript
  plan:             'free' | 'starter' | 'business' | 'enterprise' | 'pilot'
```

- [ ] **Step 2: Update billing router to expose assistant limits**

In `backend/src/billing/router.ts`:

1. Add the import for `countPromptsUsedToday` at the top (after existing imports):

```typescript
import { countPromptsUsedToday } from '../assistant/router.js'
```

2. In the `/billing/status` handler, add `countPromptsUsedToday` to the parallel queries and extend the response. Change:

```typescript
  fastify.get('/billing/status', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const tenant = req.tenant
    const plan   = tenant.plan as Plan

    const start = new Date()
    start.setUTCDate(1)
    start.setUTCHours(0, 0, 0, 0)

    const [[scanRow], [seatRow]] = await Promise.all([
      db.select({ n: count() }).from(scans)
        .where(and(eq(scans.tenantId, tenant.id), gte(scans.occurredAt, start))),
      db.select({ n: count() }).from(members)
        .where(eq(members.tenantId, tenant.id)),
    ])

    const monthlyScans = scanRow?.n ?? 0
    const currentSeats = seatRow?.n ?? 0
    const scanLimit    = getScanLimit(plan)
    const seatLimit    = getSeatLimit(plan)

    return reply.send({
      plan,
      subscriptionStatus: tenant.subscriptionStatus,
      trialEndsAt:        tenant.trialEndsAt?.toISOString() ?? null,
      seatCount:          currentSeats,
      seatLimit,
      monthlyScans,
      scanLimit,
      scanBlocked:        isOverScanLimit(plan, monthlyScans),
      paymentProvider:    tenant.paymentProvider ?? null,
      features: {
        assistantEnabled:  PLAN_LIMITS[plan]?.assistantEnabled ?? false,
        advancedAnalytics: PLAN_LIMITS[plan]?.advancedAnalytics ?? false,
      },
    })
  })
```

to:

```typescript
  fastify.get('/billing/status', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const tenant = req.tenant
    const plan   = tenant.plan as Plan

    const start = new Date()
    start.setUTCDate(1)
    start.setUTCHours(0, 0, 0, 0)

    const [[scanRow], [seatRow], promptsUsedToday] = await Promise.all([
      db.select({ n: count() }).from(scans)
        .where(and(eq(scans.tenantId, tenant.id), gte(scans.occurredAt, start))),
      db.select({ n: count() }).from(members)
        .where(eq(members.tenantId, tenant.id)),
      countPromptsUsedToday(tenant.id),
    ])

    const monthlyScans = scanRow?.n ?? 0
    const currentSeats = seatRow?.n ?? 0
    const scanLimit    = getScanLimit(plan)
    const seatLimit    = getSeatLimit(plan)
    const limits       = PLAN_LIMITS[plan]

    return reply.send({
      plan,
      subscriptionStatus: tenant.subscriptionStatus,
      trialEndsAt:        tenant.trialEndsAt?.toISOString() ?? null,
      seatCount:          currentSeats,
      seatLimit,
      monthlyScans,
      scanLimit,
      scanBlocked:        isOverScanLimit(plan, monthlyScans),
      paymentProvider:    tenant.paymentProvider ?? null,
      features: {
        assistantEnabled:  limits?.assistantEnabled  ?? false,
        advancedAnalytics: limits?.advancedAnalytics ?? false,
      },
      assistantLimits: {
        promptsPerDay:    limits?.assistantPromptsADay   ?? -1,
        promptsUsedToday,
        maximumTokens:    limits?.assistantMaximumTokens ?? -1,
      },
    })
  })
```

- [ ] **Step 3: Typecheck**

```powershell
cd backend
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```powershell
git add backend/src/billing/
git commit -m "feat(billing): expose assistant limits in billing status; add pilot to ActivateInput"
```

---

## Task 5: Auto-provision pilot plan via Clerk webhook

**Files:**
- Modify: `backend/src/webhooks/clerk.ts`

**Interfaces:**
- Consumes: `Plan` type from Task 1 (now includes `'pilot'`)
- Produces: new tenants created with `plan: 'pilot'` when `PILOT_MODE=true`, `plan: 'free'` otherwise

**Activation:** Ryan Kowalski sets `PILOT_MODE=true` as a Render environment variable on the backend service. Removing it (or setting `PILOT_MODE=false`) returns to free-tier auto-provision.

- [ ] **Step 1: Update clerk webhook auto-provision**

In `backend/src/webhooks/clerk.ts`, find the auto-provision block in `case 'user.created'` (currently line 63-80). Change:

```typescript
          const [tenant] = await db.insert(tenants).values({
            name:           `${first_name ?? localPart}'s Organization`,
            orgTokenHash:   await hashToken(orgSecret),
            adminTokenHash: await hashToken(adminSecret),
            plan:           'free',
          }).returning({ id: tenants.id })
```

to:

```typescript
          const autoPlan = process.env.PILOT_MODE === 'true' ? 'pilot' : 'free'

          const [tenant] = await db.insert(tenants).values({
            name:           `${first_name ?? localPart}'s Organization`,
            orgTokenHash:   await hashToken(orgSecret),
            adminTokenHash: await hashToken(adminSecret),
            plan:           autoPlan,
          }).returning({ id: tenants.id })
```

- [ ] **Step 2: Typecheck**

```powershell
cd backend
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```powershell
git add backend/src/webhooks/clerk.ts
git commit -m "feat(auth): auto-provision pilot plan when PILOT_MODE=true"
```

---

## Task 6: mykka-web pilot mode — hide pricing

**Files:**
- Modify: `mykka-web/lib/config.ts`
- Modify: `mykka-web/app/pricing/PricingClient.tsx`

**Interfaces:**
- Produces: `IS_PILOT_MODE: boolean` exported from `config.ts`; pricing page renders a pilot banner when true

**Activation:** Ryan Kowalski sets `NEXT_PUBLIC_PILOT_MODE=true` as a Vercel environment variable for the `master` branch production deployment. The `staging` branch deployment does not have this variable set (defaults to `false`).

- [ ] **Step 1: Add IS_PILOT_MODE to config**

In `mykka-web/lib/config.ts`, replace the entire file:

```typescript
export const APP_URL      = process.env.NEXT_PUBLIC_APP_URL      ?? 'https://app.mykka.ai'
export const IS_PILOT_MODE = process.env.NEXT_PUBLIC_PILOT_MODE  === 'true'
```

- [ ] **Step 2: Update PricingClient to render pilot banner when active**

In `mykka-web/app/pricing/PricingClient.tsx`, add the import and early return after the existing imports:

```typescript
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { APP_URL, IS_PILOT_MODE } from '@/lib/config'
```

Then, immediately before the `return (` statement inside `PricingClient()`, add:

```typescript
  if (IS_PILOT_MODE) {
    return (
      <div className="px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Pilot Program</p>
          <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">
            You're In
          </h1>
          <p className="mx-auto mb-8 max-w-lg text-[16px] text-[#94a3b8]">
            Pretzel is currently in a closed pilot. All features are available at no cost during the pilot period.
            Pricing will be announced before general availability.
          </p>
          <Link
            href={`${APP_URL}/onboarding`}
            className="inline-block rounded-xl bg-[#7c6aff] px-8 py-3 text-[14px] font-bold text-white hover:bg-[#6b59ee]"
          >
            Access the Console →
          </Link>
        </div>
      </div>
    )
  }
```

- [ ] **Step 3: Build to verify no errors**

```powershell
cd mykka-web
pnpm build
```

Expected: build succeeds with zero TypeScript errors.

- [ ] **Step 4: Commit**

```powershell
git add mykka-web/lib/config.ts mykka-web/app/pricing/PricingClient.tsx
git commit -m "feat(mykka-web): hide pricing grid and show pilot banner when NEXT_PUBLIC_PILOT_MODE=true"
```

---

## Task 7: Console — hide billing section for pilot plan

**Files:**
- Modify: `pretzel-console/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `billing?.plan` from the existing `/billing/status` API (already fetched by `useBilling()` hook)
- Produces: Billing section is not rendered when `billing.plan === 'pilot'`

Note: `PlanGate` needs no changes — `pilot` has `assistantEnabled: true`, so the assistant page renders directly for pilot tenants.

- [ ] **Step 1: Suppress billing section for pilot tenants**

In `pretzel-console/src/pages/SettingsPage.tsx`, find the Billing section (currently starts at line 143):

```typescript
      {/* Billing */}
      {billing && (
```

Change it to:

```typescript
      {/* Billing — hidden for pilot tenants; billing is inactive during pilot */}
      {billing && billing.plan !== 'pilot' && (
```

- [ ] **Step 2: Typecheck**

```powershell
cd pretzel-console
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```powershell
git add pretzel-console/src/pages/SettingsPage.tsx
git commit -m "feat(console): hide billing section for pilot plan tenants"
```

---

## Activation Runbook

Once all tasks are merged to `master`:

### Turn ON pilot mode

1. **Ryan** sets `PILOT_MODE=true` in Render → backend service → Environment → redeploy.
2. **Ryan** sets `NEXT_PUBLIC_PILOT_MODE=true` in Vercel → mykka-web → Production (master branch) → redeploy.
3. **Marcus** verifies: sign up as a fresh user → check console Settings → plan should show `pilot`, Billing section hidden.
4. **Natasha** runs smoke test: assistant accessible, 5-prompt limit enforced, pricing page shows pilot banner.

### Turn OFF pilot mode (go-live)

1. **Ryan** removes `PILOT_MODE` from Render (or sets to `false`) → redeploy.
2. **Ryan** removes `NEXT_PUBLIC_PILOT_MODE` from Vercel production → redeploy.
3. Existing pilot tenants keep their `pilot` plan until manually migrated — **Marcus** decides migration strategy (e.g. bulk UPDATE to `free` or `starter` based on company size).

---

## Self-Review

### Spec coverage
- [x] `assistantMaximumTokens` and `assistantPromptsADay` added to `PlanLimits` — Task 1
- [x] `-1` = don't care / unlimited — enforced in router (`!== -1` guards) — Task 3
- [x] `pilot` plan added to `PLAN_LIMITS` — Task 1
- [x] New tenants auto-provisioned on `pilot` when `PILOT_MODE=true` — Task 5
- [x] Billing hidden in mykka-web when pilot — Task 6
- [x] Billing hidden in console when plan is pilot — Task 7
- [x] Easy one-env-var toggle documented — Activation Runbook
- [x] Responsible staff listed — Responsible Personnel table + Activation Runbook

### Potential gaps
- **Existing tenants**: Pilot toggle only affects new signups. Existing free-plan tenants are not upgraded. If you want to mass-upgrade existing tenants during pilot, a one-time migration script is needed — out of scope per spec.
- **`staging` branch Vercel preview**: Ensure `NEXT_PUBLIC_PILOT_MODE` is NOT set in Vercel's Preview/staging environment. This is a Render/Vercel config concern, not a code concern.
- **Daily prompt count resets**: Counts reset at midnight UTC. Users in non-UTC timezones may find this confusing. Accept for pilot; can be refined post-pilot.
