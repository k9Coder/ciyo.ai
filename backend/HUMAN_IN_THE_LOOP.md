# Backend — Domain Review Checklist

Go through each domain, inspect routes + service logic, verify correctness, placement, and no dead code.

---

## Root ✅

- [x] `src/app.ts` — router registration, plugin setup
- [x] `src/index.ts` — server entry point
- [x] `src/types.ts` — shared request augmentations (tenant, member on req)

---

## policy ✅

- [x] `src/policy/router.ts` — routes inspected, `/tenant` GET moved to tenants router
- [x] `src/policy/service.ts`
- [x] `src/policy/compiler.ts`
- [x] `src/policy/resolver.ts`

---

## tenants ✅

- [x] `src/tenants/router.ts`
- [x] `src/tenants/service.ts`

---

## auth

- [ ] `src/auth/middleware.ts`
- [ ] `src/auth/tokens.ts`
- [ ] `src/auth/join.ts`

---

## db

- [ ] `src/db/schema.ts`
- [ ] `src/db/client.ts`
- [ ] `src/db/migrate.ts`

---

## assistant

- [ ] `src/assistant/router.ts`
- [ ] `src/assistant/service.ts`
- [ ] `src/assistant/apply.ts`
- [ ] `src/assistant/prompt.ts`
- [ ] `src/assistant/versioning.ts`
- [ ] `src/assistant/llm/interface.ts`
- [ ] `src/assistant/llm/anthropic.ts`
- [ ] `src/assistant/llm/openai.ts`
- [ ] `src/assistant/llm/groq.ts`

---

## billing

- [ ] `src/billing/router.ts`
- [ ] `src/billing/service.ts`
- [ ] `src/billing/stripe.ts`
- [ ] `src/billing/paypal.ts`
- [ ] `src/billing/limits.ts`
- [ ] `src/billing/email.ts`

---

## webhooks

- [ ] `src/webhooks/clerk.ts`

---

## members

- [ ] `src/members/router.ts`
- [ ] `src/members/service.ts`

---

## divisions

- [ ] `src/divisions/router.ts`
- [ ] `src/divisions/service.ts`

---

## teams

- [ ] `src/teams/router.ts`
- [ ] `src/teams/service.ts`

---

## subjects

- [ ] `src/subjects/router.ts`
- [ ] `src/subjects/service.ts`
- [ ] `src/subjects/snapshot.ts`

---

## rules

- [ ] `src/rules/router.ts`
- [ ] `src/rules/service.ts`

---

## events

- [ ] `src/events/router.ts`
- [ ] `src/events/service.ts`
- [ ] `src/events/policy-bus.ts`

---

## analytics

- [ ] `src/analytics/router.ts`
- [ ] `src/analytics/service.ts`

---

## audit-log

- [ ] `src/audit-log/router.ts`
- [ ] `src/audit-log/service.ts`

---

## scans

- [ ] `src/scans/router.ts`
- [ ] `src/scans/service.ts`

---

## invites

- [ ] `src/invites/router.ts`
- [ ] `src/invites/service.ts`

---

## site-configs

- [ ] `src/site-configs/router.ts`
- [ ] `src/site-configs/service.ts`

---

## destination-groups

- [ ] `src/destination-groups/router.ts`
- [ ] `src/destination-groups/service.ts`

---

## platform

- [ ] `src/platform/router.ts`
- [ ] `src/platform/service.ts`

---

## users

- [ ] `src/users/service.ts`

---

## logger

- [ ] `src/logger/index.ts`
- [ ] `src/logger/request-logging.ts`

---

## scripts

- [ ] `src/scripts/seed-e2e.ts`
- [ ] `src/scripts/seed-fintech.ts`
- [ ] `src/scripts/teardown-e2e.ts`
