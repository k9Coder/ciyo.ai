# Legal — Data Retention & GDPR Right to Erasure

**Owner suggestion:** David Horowitz (GC) → Arjun Mehta (Backend) for implementation
**Priority:** 🟡 Pre-launch
**Effort:** Legal: 1 hour. Engineering: 1–2 days (scheduled job + member delete cascade)

---

## Context

Two confirmed issues in `backend/src/scans/service.ts` (TODO comment lines 1–18):

1. **No retention purge:** The `scans` table grows without bound. Old rows accumulate indefinitely. Per GDPR Art. 5(1)(e) (storage limitation), scan metadata is behavioral personal data and must be purged when no longer necessary.

2. **Member deletion leaves dangling PII:** When a member is deleted, their scan rows remain (`memberId` is nullable FK — schema allows it, no FK error). The member's scan history (which sites they used AI on, when) is personal data and must be erased on a GDPR erasure request.

---

## Acceptance criteria

- [ ] David sets the retention policy: what's the default window? (e.g. 90 days per tenant, configurable)
- [ ] Arjun implements a scheduled job (Railway/Render cron or Postgres `pg_cron`) that deletes `scans` rows older than the retention window
- [ ] On `DELETE /v1/members/:id` — either cascade-delete the member's scan rows OR anonymize (`SET memberId = NULL`) so PII is removed but aggregate counts survive
- [ ] Unit test: member delete → scan rows anonymized
- [ ] `pnpm test` passes

---

## Prompt to CTO (copy-paste to staff:marcus-webb)

> **Task: implement data retention purge + member-delete PII erasure — GDPR requirement**
>
> The `scans` table has no retention mechanism — rows accumulate forever. When members are deleted, their scan rows remain with PII (behavioral data). GDPR requires a purge mechanism.
>
> Two engineering items for Arjun:
> 1. Scheduled purge job: delete `scans` rows older than N days (David sets N — default 90). Implement as a Render/Railway cron or a simple `setInterval` in the backend process if simpler.
> 2. On member delete in `backend/src/members/service.ts`: before deleting the member row, `UPDATE scans SET member_id = NULL WHERE member_id = <id>` so personal data is removed but aggregate counts survive.
>
> David needs to sign off on the retention window before Arjun codes. Ping David first.
