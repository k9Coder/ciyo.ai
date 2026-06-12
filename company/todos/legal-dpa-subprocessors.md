# Legal — DPA Sub-processor Disclosure (Member Emails → LLM Providers)

**Owner suggestion:** David Horowitz (GC) → flags to Marcus Webb (CTO) for code change
**Priority:** 🟡 Pre-launch
**Effort:** Legal: 1–2 hours review. Engineering: 1 hour (pseudonymize emails in prompt)

---

## Context

`backend/src/assistant/prompt.ts` line 36 includes `email: m.email` in the LLM system prompt.
This means member email addresses are sent to Anthropic, OpenAI, and Groq on every assistant session.

These are sub-processors under GDPR. Our DPA with each provider must cover transmission of member PII (email). If it does not, this is a GDPR Art. 28 violation.

Arjun left a code comment flagging this on 2026-06-08 (see `assistant/prompt.ts:27`).

The engineering fix is simple: replace `email: m.email` with `id: m.id` — the LLM only needs the member ID for action references, not the email. But David needs to confirm whether the legal exposure requires this urgently or if existing DPAs already cover it.

---

## Acceptance criteria

- [ ] David reviews DPAs with Anthropic, OpenAI, Groq — confirms member email is covered or not
- [ ] If NOT covered: Arjun replaces `email: m.email` with a pseudonym in `assistant/prompt.ts:36` (use `member-${hash(m.email)}` or just `m.id`)
- [ ] If covered: document the DPA reference so this isn't re-raised at every audit
- [ ] Either way: decision documented in this file

---

## Prompt to CTO (copy-paste to staff:marcus-webb)

> **Task: resolve DPA gap — member emails sent to LLM sub-processors**
>
> `backend/src/assistant/prompt.ts` line 36 includes `email: m.email` in the LLM context. This means member email addresses are transmitted to Anthropic/OpenAI/Groq on every assistant session. David Horowitz flagged this as a potential GDPR Art. 28 (sub-processor DPA) issue.
>
> Two actions needed:
> 1. David reviews our DPA agreements with each provider to confirm coverage.
> 2. Engineering fix (Arjun): replace `email: m.email` with `id: m.id` in the prompt — the LLM only needs IDs for action references. File: `backend/src/assistant/prompt.ts:36`.
>
> Recommend: do the engineering fix regardless (defense in depth). Route legal confirmation to David.
