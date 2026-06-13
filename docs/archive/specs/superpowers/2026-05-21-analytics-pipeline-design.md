# Analytics Pipeline — Sub-project A Design

**Date:** 2026-05-21
**Status:** Approved
**Blocked by:** Nothing
**Blocks:** Sub-project B (Live Dashboard)

## Summary

Add opt-in, per-rule analytics reporting. Each rule gets a `report_level` that controls how much data the extension sends back to the backend when that rule triggers. The backend stores events in a new `events` table. The admin sets this per rule in the rule edit form. Sub-project B (dashboard) will query this table — but that's out of scope here.

Extension assumption: employees are always signed in to Clerk after first sign-in. Member ID is always available when an event is sent.

---

## Report Levels

| Level | What gets sent |
|-------|---------------|
| `none` | Nothing. Rule triggers silently. |
| `minimal` | rule ID, action (warn/block), site domain, timestamp |
| `medium` | + member Clerk ID |
| `rich` | + matched term or pattern that triggered the rule (never prompt text) |

---

## 1. DB Schema Changes

### Modify: `rules` table
Add column `reportLevel` (enum, default `none`):
```sql
ALTER TABLE rules ADD COLUMN report_level report_level_enum NOT NULL DEFAULT 'none';
```

New enum: `report_level_enum ('none', 'minimal', 'medium', 'rich')`

### Create: `events` table
```
events
  id            uuid PK defaultRandom
  tenantId      uuid FK → tenants.id
  ruleId        uuid FK → rules.id
  memberId      uuid FK → members.id  NULLABLE (future-proofing for anonymous)
  action        rule_action_enum (warn | block)
  siteUrl       text
  matchedTerm   text NULLABLE          -- only for 'rich' level
  occurredAt    timestamp with time zone defaultNow
```

Index: `(tenantId, occurredAt)` for dashboard time-range queries (Sub-project B)
Index: `(ruleId)` for per-rule analytics

---

## 2. Backend

### New: `POST /v1/events`

Auth: `requireOrgTokenOrClerkAuth` (extension uses Clerk JWT)

Request body:
```json
{
  "ruleId": "uuid",
  "action": "warn" | "block",
  "siteUrl": "https://chat.openai.com",
  "matchedTerm": "Project Zeus"   // optional, only sent at 'rich' level
}
```

Member identity resolved from the Clerk JWT (`req.member`).

**Server-side validation:** Before inserting, fetch the rule's `reportLevel`. If it's `none`, respond `204` and do nothing. This is the authoritative gate — the extension's check is best-effort only.

**What gets stored per level:**
- `minimal` → memberId = null, matchedTerm = null (even though JWT identity is known — admin chose minimal)
- `medium` → memberId = resolved from JWT, matchedTerm = null
- `rich` → memberId = resolved from JWT, matchedTerm = from request body

Response: `201 { id }` on insert, `204` if rule says `none`.

### New files:
- `backend/src/events/service.ts` — `ingestEvent(tenantId, memberId, body)`
- `backend/src/events/router.ts` — `POST /events`

---

## 3. Policy — expose `reportLevel` to extension

The policy compiler already serializes rules into the policy JSON the extension caches. Add `reportLevel` to each rule entry in the compiled policy so the extension can check it locally without a round-trip.

Modify `backend/src/policy/compiler.ts` — include `reportLevel` in each `custom` rule entry.

---

## 4. Admin UI — Rule Form

The rule create/edit modal (`EntityModal` in `SubjectsPage.tsx` or a dedicated `RuleModal`) gains a **Report level** field — a `<select>` with four options:

| Option | Label | Sublabel shown in dropdown |
|--------|-------|---------------------------|
| `none` | Don't report | Rule triggers silently |
| `minimal` | Minimal | Action + site + timestamp |
| `medium` | Medium | + who triggered it |
| `rich` | Rich | + matched term/pattern |

Default: `none`.

The field maps to the existing `api.rules.create` / `api.rules.update` calls — just add `reportLevel` to the payload. The backend already accepts unknown fields gracefully; the router just needs to pass it through to the service.

---

## 5. Extension — Send Event on Trigger

After the detection engine fires and produces a `warn` or `block` action, check the triggered rule's `reportLevel` from the cached policy doc.

- If `none` → do nothing (current behavior)
- If `minimal` → POST `/v1/events` with `{ ruleId, action, siteUrl }`
- If `medium` → POST `/v1/events` with `{ ruleId, action, siteUrl }` (member resolved server-side from JWT)
- If `rich` → POST `/v1/events` with `{ ruleId, action, siteUrl, matchedTerm }`

**Fire-and-forget:** the event POST must not block or delay the warning modal. Send it in the background; swallow errors silently (no retry, no UI feedback to the employee).

Auth: use the Clerk JWT from the extension's cached session (same token used for policy sync).

Relevant extension files:
- `src/detection/engine.ts` — where detections fire; add event dispatch here
- `src/policy/sync.ts` or `src/shared/constants.ts` — ensure `reportLevel` is included in the `PolicyDoc` type and preserved through sync

---

## 6. Data Flow

```
Employee types in ChatGPT
  → extension detection engine fires
  → rule matched, action = 'block', reportLevel = 'rich'
  → show warning modal  (not blocked by event send)
  → background POST /v1/events { ruleId, action, siteUrl, matchedTerm }
      → backend resolves member from Clerk JWT
      → backend checks rule.reportLevel (server-side gate)
      → inserts into events table
```

---

## Out of Scope (Sub-project B)

- Dashboard analytics queries
- `GET /v1/events` or any read endpoints
- Aggregation, retention policy, or event purging
