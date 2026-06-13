# Legal — Confirm Scan Data PII Scope (Does `scans` Table Store Prompt Content?)

**Owner suggestion:** Arjun Mehta (confirms code) → David Horowitz (GC reviews)
**Priority:** 🟡 Pre-launch
**Effort:** Engineering: 30 min (read + confirm). Legal: 1 hour review.

---

## Context

The extension sends scan events to `POST /v1/scans` (backend). It is unclear from the service layer alone whether:
- Only **metadata** is stored (tenant, member, timestamp, matched subject IDs) — low privacy risk
- **Prompt content or matched snippets** are stored — high privacy risk, must be disclosed in Privacy Policy

`backend/src/scans/service.ts` shows only `tenantId` and `memberId` being inserted. But the router layer and the extension's `dispatch.ts` need to be verified — what exactly is sent in the POST body, and does the DB schema store it?

This needs to be confirmed before we finalize the Privacy Policy claims on ciyo-web.

---

## Acceptance criteria

- [ ] Arjun reads `backend/src/scans/router.ts`, `backend/src/db/schema.ts` (scans table), and `pretzel/src/scans/dispatch.ts` — writes a 3-line summary of exactly what fields are stored
- [ ] David reviews the summary against the Privacy Policy on ciyo-web
- [ ] If prompt content IS stored: Privacy Policy updated to disclose; retention policy defined
- [ ] If only metadata: Privacy Policy confirmed accurate; document this so future engineers know not to add content storage silently

---

## Prompt to CTO (copy-paste to staff:marcus-webb)

> **Task: confirm what the `scans` table stores — legal review gate**
>
> David Horowitz needs to know whether `backend/src/scans/service.ts` stores only scan metadata (tenant, member, timestamp) or also prompt content / matched text snippets. This determines whether our Privacy Policy is accurate.
>
> Assign Arjun to read `backend/src/scans/router.ts`, `backend/src/db/schema.ts` (scans table definition), and `pretzel/src/scans/dispatch.ts` — produce a one-paragraph written summary of exactly what fields are persisted. Once Arjun writes the summary, route to David for legal review.
>
> No code change required unless prompt content is found in the DB schema (then it must be disclosed or removed).
