# Assistant Feature Design

**Date:** 2026-05-29
**Status:** Approved

## Overview

A conversational AI assistant embedded in the ciyo admin web app (`admin/`) that lets super admins manage rules and subjects using natural language. The admin describes what they want in plain English; the LLM interprets it and produces a set of proposed changes (create/update/delete rules or subjects) for human review before anything is applied.

## Decisions Made

| Question | Decision |
|---|---|
| Where does it live? | Admin web app (`admin/`), new route `/assistant` in the existing sidebar nav |
| Who can use it? | Super admins only (existing `requireAdminTokenOrClerkAdmin` middleware) |
| Apply flow | Preview then confirm — admin reviews proposed changes, clicks Apply |
| Chat history | Persisted per-user in the DB across sessions |
| LLM context | Full tenant snapshot (subjects + rules + teams + divisions) injected on every request |
| LLM provider | Swappable — thin `LlmService` interface, start with Anthropic or OpenAI |
| Chat layout | 50/50 split — chat pane left, preview pane right |
| Nav label | "Assistant" |

## Architecture

### Request Flow

Each chat turn is one LLM round trip. No streaming, no tool calls.

```
Admin types message
    ↓
POST /assistant/chat  { message, sessionId? }
    ↓
backend/src/assistant/service.ts
  1. Upsert session (create if no sessionId)
  2. Fetch tenant snapshot: subjects + rules + teams + divisions
  3. Load last 20 messages from this session (conversation history)
  4. buildSystemPrompt(snapshot) → system prompt string
  5. llmService.chat(systemPrompt, history, message) → { reply, actions[] }
  6. Persist: INSERT chat_message (role=user) + INSERT chat_message (role=assistant, actions_json)
  7. Return { sessionId, messageId, reply, actions }
    ↓
Frontend renders:
  - Chat pane: assistant reply text + action-count badge
  - Preview pane: proposed action cards (if actions.length > 0)
    ↓
Admin clicks "Apply Changes"
    ↓
POST /assistant/apply  { messageId }
    ↓
backend/src/assistant/apply.ts
  - Execute each action via existing services (rules/service.ts, subjects/service.ts)
  - SET applied_at = now() on the message
  - Return { applied: Action[], errors: string[] }
    ↓
Frontend:
  - Preview pane clears
  - Chat shows "Applied ✓" indicator on the message
  - Invalidates /subjects and /rules React Query caches
```

### Clarifying Questions

When the LLM needs clarification (e.g. "which team?"), it returns `{ reply: "...", actions: [] }`. The preview pane stays empty. The admin types their answer in the same chat input, triggering another `/chat` call with the full conversation history. No special UI state is needed — it's just a normal turn.

## Data Model

Two new tables added to `backend/src/db/schema.ts`.

### `chat_sessions`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | → tenants |
| member_id | uuid FK | → members |
| title | text | Auto-generated from first message |
| created_at | timestamptz | |

One session = one conversation thread. A user can have multiple sessions.

### `chat_messages`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK | → chat_sessions |
| role | enum | 'user' \| 'assistant' |
| content | text | The message text |
| actions_json | jsonb | Proposed actions array; null for user messages |
| applied_at | timestamptz | Null until admin clicks Apply |
| created_at | timestamptz | |

`applied_at` doubles as the audit trail — shows when and which session caused a rule change.

## Action Schema

The LLM produces an array of typed action objects stored in `actions_json`. The backend validates each before executing.

```typescript
type Action =
  | { op: 'create_rule';   subjectId: string; kind: RuleKind; keywords?: string[];
      pattern?: string; destinations?: string[]; destinationGroupIds?: string[];
      action: RuleAction; message?: string; reportLevel?: ReportLevel }
  | { op: 'update_rule';   ruleId: string; patch: Partial<RuleFields> }
  | { op: 'delete_rule';   ruleId: string }
  | { op: 'create_subject'; name: string; description?: string; divisionId?: string; teamId?: string }
  | { op: 'update_subject'; subjectId: string; patch: Partial<SubjectFields> }
  | { op: 'delete_subject'; subjectId: string }
```

One LLM response can contain multiple actions (e.g. "create a subject and add 3 rules" = 4 actions).

## Backend API

All endpoints under `/assistant`, protected by `requireAdminTokenOrClerkAdmin`.

| Method | Path | Body | Returns | Purpose |
|---|---|---|---|---|
| POST | /assistant/chat | `{ message, sessionId? }` | `{ sessionId, messageId, reply, actions[] }` | Send a message; creates session if needed |
| POST | /assistant/apply | `{ messageId }` | `{ applied, errors }` | Execute actions from a message |
| GET | /assistant/sessions | — | `{ sessions[] }` | List user's past sessions |
| GET | /assistant/sessions/:id/messages | — | `{ messages[] }` | Load full session history |

### File Structure

```
backend/src/assistant/
  router.ts       ← Fastify routes
  service.ts      ← Orchestration: snapshot → prompt → LLM → persist
  prompt.ts       ← buildSystemPrompt(snapshot): builds the 5-section system prompt
  apply.ts        ← executeActions(tenantId, actions[]): delegates to existing services
  llm/
    interface.ts  ← LlmService interface + Action types
    anthropic.ts  ← AnthropicLlmService implementation
    openai.ts     ← OpenAiLlmService implementation
```

## System Prompt Design

`buildSystemPrompt(snapshot)` assembles five sections in order:

**① Role + product knowledge (static)**
Explains ciyo, what the assistant does, and the key constraint: always return JSON, never apply changes directly, ask for clarification when scope is ambiguous.

**② Data model reference (static)**
Documents Subject, Rule, Division, Team, and all enum values (rule kinds, actions, report levels).

**③ Current tenant state snapshot (dynamic)**
Compact JSON lines listing current divisions, teams, subjects, and rules with their real IDs. Approximately 2–5 KB for a typical tenant — well within all model context limits.

**④ Output format instructions (static)**
Specifies the exact JSON response shape:
```json
{ "reply": "...", "actions": [] }
```
Instructs the LLM to use exact IDs from the snapshot, never invent IDs, and return `actions: []` when asking a clarifying question or answering informational queries.

**⑤ Few-shot examples (static)**
One worked example showing a user request → full JSON response with a realistic action, to anchor the output format.

## Frontend

### Route

New entry in `admin/src/App.tsx`:
```tsx
<Route path="/assistant" element={<AssistantPage />} />
```

New nav item in `AppLayout.tsx`:
```ts
{ to: '/assistant', label: 'Assistant', icon: '✦' }
```

### Component Tree

```
AssistantPage                     ← /assistant route, 50/50 flex split
  ├── ChatPane
  │     ├── SessionTabs           ← horizontal strip of recent sessions + "New chat" button
  │     ├── MessageList           ← scrollable, auto-scrolls to bottom on new message
  │     │     └── MessageBubble   ← user (right, brand color) | assistant (left, surface)
  │     │           └── action badge if actions.length > 0
  │     └── ChatInput             ← textarea + Send button; disabled while request in-flight
  └── PreviewPane
        ├── ActionList            ← rendered only when actions.length > 0
        │     └── ActionItem      ← CREATE (green) / UPDATE (blue) / DELETE (red) card
        └── ActionBar             ← Apply + Discard buttons; hidden when no pending actions
```

### Data Fetching

- `useAssistantSessions()` — GET /assistant/sessions, loads session strip
- `useAssistantMessages(sessionId)` — GET /assistant/sessions/:id/messages, loads history
- `useSendMessage()` — POST /assistant/chat mutation
- `useApplyActions()` — POST /assistant/apply mutation; on success invalidates `['subjects']` and `['rules']` query keys

### Key UX Rules

- Chat input is disabled (with loading indicator) while `useSendMessage` is in-flight
- Preview pane always shows the actions from the **most recent assistant message** only. Once the user sends a new message, the previous proposed actions are superseded (unapplied ones remain in the DB as history but are no longer shown)
- Preview pane is empty (no Apply button) when the most recent assistant message has `actions: []`
- Clicking Discard clears local pending state without any backend call — the actions remain in the DB as history but are no longer shown in the UI
- After Apply succeeds, the assistant message shows a small "Applied ✓" badge
- Session title is auto-generated on the backend from the first user message (first 60 chars)

## Out of Scope (v1)

- Streaming responses
- LLM tool calls / multi-step agentic loops
- Division admin access (super admin only for now)
- Undo / rollback of applied changes
- Per-session sharing or exporting
