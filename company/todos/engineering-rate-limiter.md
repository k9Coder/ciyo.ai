# Rate Limiting — All Backend Endpoints

**Owner suggestion:** Arjun Mehta (Backend Engineer)
**Priority:** 🔴 Must-have before launch
**Effort:** ~half day

---

## Context

Zero rate limiting exists on any backend endpoint. Most dangerous targets:

- `POST /v1/assistant/chat` — each unauthenticated/abusive call burns LLM API budget (OpenAI/Anthropic/Groq). No limit = unlimited free LLM usage at our cost.
- `POST /v1/events` — scan event ingestion. No limit = DB bloat attack.
- `POST /v1/billing/*` — checkout session creation. No limit = enumeration.
- `POST /v1/invites/accept` — brute-forceable invite tokens.

Confirmed in the June 2026 security scan as a CRITICAL finding (item #4). No `@fastify/rate-limit` plugin is registered anywhere in `backend/src/app.ts`.

---

## Acceptance criteria

- [ ] `@fastify/rate-limit` installed and registered globally in `backend/src/app.ts`
- [ ] Default: 100 req/min per IP
- [ ] `POST /v1/assistant/chat` tighter limit: 20 req/min per authenticated tenant
- [ ] `POST /v1/events`: 200 req/min per tenant (scans are batch but frequent)
- [ ] Rate limit headers returned (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- [ ] 429 response body: `{ "error": "Too many requests" }`
- [ ] Unit test: verify 429 after N+1 requests
- [ ] `pnpm test` passes with no regressions

---

## Prompt to CTO (copy-paste to staff:marcus-webb)

> **Task: implement rate limiting on the backend — CRITICAL pre-launch blocker**
>
> We have zero rate limiting on any API endpoint. The most dangerous gap: `POST /v1/assistant/chat` can be hammered to drain our LLM budget (OpenAI/Anthropic/Groq charges per token — no limit means unlimited free AI at our expense). Also `POST /v1/events` for DB bloat.
>
> Fix: register `@fastify/rate-limit` in `backend/src/app.ts`. Default 100 req/min per IP globally. Tighten assistant chat to 20 req/min per authenticated tenant. Events to 200 req/min per tenant.
>
> File to modify: `backend/src/app.ts`. Tests go in `backend/tests/`. Half-day effort. Assign to Arjun Mehta. Must pass before launch.
