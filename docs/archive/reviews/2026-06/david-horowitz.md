# Legal & Compliance Review — David Horowitz, General Counsel (Fractional)
**mykka.ai / Pretzel — Backend, Extension & Marketing**
Date: 2026-06-08

---

## Preamble

This review covers data handling, privacy, consent, third-party data sharing, retention, deletion, billing data hygiene, and the fidelity of public-facing security claims. I reviewed the schema (`schema.ts`) in addition to the 17 listed files because the schema is the ground truth for what is actually stored — it is load-bearing for several findings below.

---

#### `backend/src/audit-log/router.ts` — Audit-log API endpoint (admin-only, paginated)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** The endpoint is correctly gated behind `requireAdminTokenOrClerkAdmin`. However, the response payload includes `memberEmail` and `matchedTerm`. `matchedTerm` is the exact substring from the user's prompt that triggered the rule (e.g., "SSN: 123-45-6789", a regex match on a credit-card number pattern, or a high-entropy string that looks like an API key). This is sensitive PII/PHI that is served over the API to any admin token holder with no field-level access control, no redaction option, and no documented data classification in the API response. There is also no retention-window filter on the query — an admin can page through the entire history of events with no enforced look-back cap. Under GDPR Art. 5(1)(e) (storage limitation), serving unbounded event history without a retention boundary is a gap. Under a future SOC 2 Type II audit, unrestricted `matchedTerm` export will be flagged as a control failure on the principle of least privilege.
  **Proposed changes:**
  1. Add a configurable `reportLevel` gate on `matchedTerm`: only return it when the matching rule's `reportLevel` is `medium` or `rich`; mask it (`"[REDACTED]"`) otherwise. The `reportLevel` column already exists on the `rules` table — wire it through the join.
  2. Add a hard maximum look-back window (e.g., 90 or 365 days configurable per tenant) enforced server-side so that historical PII is not indefinitely accessible via cursor pagination regardless of the tenant's own data retention policy.

---

#### `backend/src/audit-log/service.ts` — Audit-log DB query (joins events, members, rules, subjects)
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** Two critical gaps:

  1. **No data retention / purge mechanism.** The `events` table has no `deletedAt` column and no TTL. The service only reads — there is no purge function, no scheduled cleanup job, and no `DELETE` query anywhere in scope. The Security page publicly claims "We support data deletion requests within 30 days." That claim cannot be honored for event records tied to a member because there is no code path that deletes or anonymizes `events` rows when a member is deleted or when a tenant submits a GDPR erasure request. GDPR Art. 17 (right to erasure) is unenforceable in the current codebase. This is a live GDPR exposure.

  2. **`matchedTerm` stored verbatim and permanently.** The `events.matchedTerm` column stores the exact text excerpt that matched a DLP rule (see schema line 169). For a keyword rule this could be "Project Titan", for a pattern rule it could be a full SSN or credit card PAN fragment. This is PII/PHI stored permanently in plaintext in the `events` table with no encryption-at-rest at the application layer (the Security page says AES-256 at rest — this presumably refers to disk-level encryption, not field-level, but the distinction matters legally for `matchedTerm` because it is effectively a transcript of sensitive content). The system prompt in `assistant/prompt.ts` explicitly says "Prompt content is never stored" — and the Security page repeats this claim. But `matchedTerm` IS a fragment of prompt content, stored server-side forever. This is a material inconsistency between the marketing claim and the code.

  **Proposed changes:**
  1. Implement an `events` purge job: a scheduled function that `DELETE`s `events` rows (and `scans` rows) older than N days (configurable per tenant, defaulting to the promised 30 days for personal data / 90 days for aggregate). Trigger it on member deletion via a cascade or a background task.
  2. Either: (a) stop storing `matchedTerm` for high-sensitivity rule kinds, storing only the `ruleId` (which already identifies the matched category), or (b) encrypt `matchedTerm` at the application layer before insert and decrypt only for authorized reads. Option (a) is simpler and likely sufficient for DLP use cases. Option (b) is required if you want to support rich audit replay.
  3. Add `anonymizeEvents(memberId)` function that nullifies `memberId` on all events for that member on erasure request, consistent with Art. 17.

---

#### `backend/src/billing/service.ts` — Tenant activation and free-tier signup
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** The `freeTierSignup` function calls `sendWelcomeEmail` with `.catch(() => {})` — silently swallowing email delivery failures. From a compliance standpoint the tokens in that email are security-critical credentials; silent failure means the customer may never receive them and there is no audit trail of the delivery attempt. More substantively: `activateTenant` stores `stripeCustomerId` in the `tenants` table. This is a Stripe reference ID, not raw card data, which is acceptable under PCI-DSS SAQ A. No raw card numbers, CVVs, or expiry dates appear in code or schema — that passes PCI-DSS. However, `paymentProvider` is stored as a plain text string (`'stripe'` or `'paypal'`) with no enum enforcement in the schema (line 31 of schema.ts). This is a minor data-quality issue rather than a compliance issue.
  **Proposed changes:**
  1. Replace the silent `.catch(() => {})` on `sendWelcomeEmail` with a logged warning (with a correlation ID) so that failed onboarding emails are observable and can be retried or flagged for support intervention.
  2. Add `pgEnum` for `paymentProvider` in the schema to prevent unexpected values being persisted.

---

#### `backend/src/billing/email.ts` — Welcome email with org and admin tokens in plaintext
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** The welcome email transmits the full `orgToken` and `adminToken` in plaintext email body. These tokens are the credentials that authorize pushing DLP policy to every browser in the customer's fleet. Email is not a secure channel — it is stored in mail servers, potentially scanned by spam filters, logged by SMTP relays, and forwarded by users. Transmitting high-value credentials via email is a standard security anti-pattern. From a legal standpoint: if an attacker obtains these tokens via email interception and uses them to push a malicious policy, mykka.ai's liability posture is weak because the transmission method is the proximate cause of the credential exposure.

  Additionally: there is no `tls: { rejectUnauthorized: true }` or equivalent option on the `nodemailer.createTransport` call. The transport will happily connect to an SMTP server over an unverified TLS connection. This undermines the claim of "TLS 1.3 in transit" for the token delivery flow specifically.
  **Proposed changes:**
  1. Replace plaintext token delivery with a secure link pattern: store the tokens server-side, email a time-limited one-time link (`https://console.mykka.ai/onboard?token=<signed-JWT>`), and show the tokens only on the authenticated console page after the link is clicked. The tokens are already returned in the `ActivateResult` from `activateTenant` — render them in the console UI instead of emailing them verbatim.
  2. Add `tls: { rejectUnauthorized: true }` to the nodemailer transport options to enforce verified TLS for outbound email.

---

#### `backend/src/analytics/service.ts` — Analytics aggregation (summary, daily, incidents, top sites, by subject)
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** `getAnalyticsIncidents` (lines 82–110) returns `memberEmail` and `siteUrl` with no pagination limit enforcement and no time-based filter — it fetches the 20 most recent incidents globally for the tenant, but crucially returns `memberEmail` in every row. This function makes individual employee behavior visible to tenant admins in a browsable list, linking a specific named employee to a specific site URL at a specific timestamp. Under GDPR (which applies to EU employees, and mykka.ai's Security page claims EU data storage by default), employee monitoring data of this nature requires a lawful basis (typically legitimate interests) and a proportionality assessment. The `siteUrl` field compounds this: if an employee was using ChatGPT at `chat.openai.com` with a query that triggered a DLP rule, the incident record records both who they are and where they were. That is surveillance data.

  Separately: `getAnalyticsTopSites` collects aggregated domain-level data about which AI tools employees use. This is behavioral analytics on employee activity. The privacy policy (not reviewed here but implied by the Security page) would need to explicitly disclose this use.
  **Proposed changes:**
  1. Add role-gating to the incidents endpoint that calls this function: division admins should only see events for members in their division, not the whole tenant. (The `reportLevel` field on rules already models this intent — wire it through to the analytics layer.)
  2. Provide a configurable option to pseudonymize `memberEmail` in analytics responses (replace with a stable hash or `"user-XXXX"`) for tenants that want DLP analytics without exposing employee identity in the dashboard. This is a standard enterprise privacy control.
  3. Document the lawful basis for employee monitoring in the DPA template and surface it to customers during onboarding.

---

#### `backend/src/scans/service.ts` — Scan recording and billing limit enforcement
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** Every prompt scan is recorded as a row in the `scans` table, linked to `tenantId` and `memberId`. The `scans` table has no retention mechanism — rows accumulate indefinitely. The `countMonthlyScans` function reads from the beginning of the current calendar month, so old rows are functionally ignored for billing purposes but are never deleted. Over time this table will contain a complete history of every AI prompt a member ever submitted for scanning (the prompt content itself is not stored, but the fact that a scan happened, for which member, at what timestamp, is stored). This is behavioral metadata about employee AI usage habits and is subject to GDPR minimization principles. There is also no deletion cascade — when a member is deleted via `deleteMember`, their `scans` rows remain with a dangling `memberId` FK (which is nullable, so it won't error — but it means deleted members' scan counts remain in the system permanently).
  **Proposed changes:**
  1. Add a scheduled purge for `scans` rows older than the retention window (same job as the `events` purge recommended above).
  2. On `deleteMember`, either delete or anonymize (set `memberId = null`) that member's scan rows so that deletion of a member actually removes their personal data footprint.

---

#### `backend/src/members/service.ts` — Member CRUD (create, update, delete, import, team assignment)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `deleteMember` (lines 79–82) deletes from `memberTeams` and `members` — but does NOT delete or anonymize associated `events` or `scans` rows. As noted above, this means a "deleted" member's personal data (email tied to behavioral events) persists indefinitely in the events and scans tables. Under GDPR Art. 17, deleting a member profile does not satisfy an erasure request if the member's email continues to appear in `events.memberEmail` via the `members` join.

  `importMembers` (lines 94–110) bulk-inserts member records with emails provided by the tenant admin. There is no validation that the importing admin has legal authority to enroll these individuals. While this is a business process concern more than a direct code concern, it is worth noting that GDPR requires a lawful basis for processing each individual's data — bulk import by an admin without per-user consent is legally permissible under legitimate interests in an enterprise DLP context, but it should be documented.
  **Proposed changes:**
  1. Extend `deleteMember` to either (a) cascade-delete associated `events` and `scans` rows for that member, or (b) anonymize them (set `memberId = null`, which the schema already supports as nullable). Option (b) preserves aggregate analytics integrity while honoring erasure.
  2. Add a GDPR erasure endpoint (`DELETE /v1/members/:id/gdpr-erase`) that performs the full anonymization cascade, distinct from the administrative `deleteMember` so that erasure requests have an auditable paper trail.

---

#### `backend/src/users/service.ts` — User profile CRUD (Clerk-backed identity)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `nullifyClerkId` (line 33) sets `clerkId = null` when a Clerk account is deleted, which is the right approach to decouple the Clerk identity from the local user record. However, the `users` row itself is NOT deleted — `email`, `firstName`, `lastName`, `avatarUrl` all persist after Clerk account deletion. There is no `deleteUser` function. This means that even after a user closes their Clerk account, their PII remains in the `users` table indefinitely. The Clerk webhook presumably triggers `nullifyClerkId`, but that is the full extent of the deletion response. GDPR Art. 17 requires deletion of personal data, not just nullification of a foreign key.

  `avatarUrl` deserves a specific note: it is stored as a URL pointing to Clerk's CDN (or another third party). If the user deletes their Clerk account, that URL likely becomes stale or dead, but the URL string persists in the database. Depending on the URL format it may contain user identifiers.
  **Proposed changes:**
  1. Implement a `deleteUser(clerkId)` function that: (a) nullifies all `memberId` and `userId` FK references pointing to this user across `events`, `scans`, `chatSessions`, and `chatMessages`; (b) then deletes the `users` row. Wire this to the Clerk `user.deleted` webhook handler.
  2. If full deletion is not desired for audit integrity reasons, implement anonymization: overwrite `email`, `firstName`, `lastName`, `avatarUrl` with placeholder values (e.g., `"deleted-user@[redacted]"`, `null`, `null`, `null`) and set `clerkId = null`.

---

#### `backend/src/assistant/llm/anthropic.ts` — Anthropic Claude API integration
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** The system prompt sent to Anthropic (constructed in `assistant/prompt.ts`) includes the full tenant snapshot: all member emails, member IDs, member roles, all rule keywords and patterns, all division and team names, and subject descriptions. This is customer PII (member emails) and confidential business configuration (DLP rule sets) transmitted to Anthropic's API with every assistant chat message. This constitutes a third-party data transmission of customer PII to Anthropic that must be:
  1. Disclosed in the Privacy Policy (third-party processors section).
  2. Covered by a Data Processing Agreement (DPA) with Anthropic (Anthropic offers one for API customers — it must actually be signed).
  3. Disclosed to enterprise customers in mykka.ai's DPA so they can include Anthropic as a sub-processor.

  There is no indication in the codebase that this sub-processor relationship is documented or disclosed. Additionally, the chat session messages (user turns and assistant replies) are stored verbatim in the `chatMessages` table (see schema `chatMessages.content`), which means admin natural-language inputs — which may contain sensitive information ("add a rule to block SSNs for the Healthcare division") — are persisted server-side and also transmitted to Anthropic.

  There is no mechanism to exclude the member emails from the system prompt even when `reportLevel` is `none` — the `memberSummaries` always include `email`.
  **Proposed changes:**
  1. Sign an Anthropic API DPA and list Anthropic as a sub-processor in your Privacy Policy and customer-facing DPA template.
  2. Add a privacy filter to `buildSystemPrompt`: when the caller's plan is below a threshold or when a privacy mode is enabled, replace member emails with pseudonyms (e.g., `"member-<hash>"`) in the snapshot before it is sent to Anthropic. Member emails are not needed for most policy management tasks — the AI only needs member IDs and roles.
  3. Add a retention policy for `chatMessages` rows (e.g., purge sessions older than 90 days) since they contain natural-language descriptions of DLP policy intent, which is sensitive business data.

---

#### `backend/src/assistant/llm/openai.ts` — OpenAI GPT-4o API integration
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** Same issue class as `anthropic.ts`. The same system prompt (including member emails and full rule/keyword sets) is transmitted to OpenAI's API. OpenAI must also be listed as a sub-processor in the Privacy Policy and customer DPA. The `response_format: { type: 'json_object' }` constraint is good for output safety, but has no bearing on the privacy exposure. One additional concern: `gpt-4o` is a specific model version — OpenAI's data usage terms differ between API tiers (zero-data-retention is only available on certain enterprise contracts). If mykka.ai is on a standard API plan, OpenAI may retain API inputs for up to 30 days for abuse monitoring, meaning member emails and rule keywords may be retained by OpenAI.
  **Proposed changes:** Same as `anthropic.ts`. Additionally: confirm OpenAI API contract tier and ensure zero-data-retention (ZDR) is configured, or disclose to customers that OpenAI may retain inputs for up to 30 days under standard terms. Document this in the sub-processor addendum.

---

#### `backend/src/assistant/llm/groq.ts` — Groq (LLaMA 3.3) API integration
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** Same issue class as `anthropic.ts` and `openai.ts` — the same system prompt with member PII is transmitted to Groq's API. Groq is the least well-known of the three sub-processors here and its data retention / DPA terms are the least mature. Groq must be listed as a third sub-processor. The fact that the OpenAI SDK `baseURL` override is used to route to Groq is an implementation detail, but legally Groq is a distinct data sub-processor from OpenAI and must be disclosed separately. If any customer has an enterprise DPA with mykka.ai that lists approved sub-processors, Groq's absence from that list creates a contractual breach.
  **Proposed changes:** Same as `anthropic.ts`. Additionally: the LLM provider should be a configurable, per-tenant setting disclosed at onboarding, so enterprise customers know which provider is processing their data for any given assistant session.

---

#### `backend/src/assistant/prompt.ts` — System prompt construction (tenant snapshot injected into LLM context)
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** This is the most consequential file in the review. Line 27–29 explicitly include member emails in the prompt sent to all three external LLM providers:
  ```ts
  const memberSummaries = snapshot.members.map(m => ({
    id: m.id, email: m.email, role: m.role, adminDivisionId: m.adminDivisionId,
  }))
  ```
  Member emails are PII under GDPR. They are being transmitted to Anthropic, OpenAI, and Groq without any anonymization, every single time an admin uses the assistant. The system prompt also includes all rule `keywords` (line 22–25) — which may include sensitive terminology like specific project codenames, medical terms, or financial identifiers that the customer treats as confidential. The full `pattern` (regex) for each rule is also included — exposing the customer's complete DLP ruleset to external AI providers.

  The SECURITY GUARDRAILS in the prompt (lines 38–99) are excellent from a prompt-injection standpoint and show good security thinking. However they do not address the data minimization problem: the guardrails prevent the AI from exfiltrating data to a third party via its output, but the data has already been exfiltrated to the AI provider via the system prompt input.

  There is also a philosophical inconsistency: this product's core value proposition is preventing sensitive data from leaving an organization via AI prompts — yet the backend assistant feature transmits member PII to multiple external AI providers by design.
  **Proposed changes:**
  1. **Immediate:** Remove `email` from `memberSummaries`. Use only `id` and `role`. The AI assistant does not need email addresses to manage policy; it references members by ID. Display names can be shown in the UI from local state without including them in the LLM prompt.
  2. **Near-term:** Add a feature flag (`assistantEnabled: boolean` per tenant) that defaults to `false` for enterprise customers until they have explicitly acknowledged the sub-processor disclosure in the DPA.
  3. **Near-term:** Log all LLM provider calls (provider name, approximate token count, timestamp, tenant ID) for sub-processor audit trail purposes — without logging the actual prompt content.
  4. **Longer-term:** Evaluate whether the assistant can operate on anonymized references (member IDs, subject IDs) and resolve them to human-readable names only in the UI layer, so the LLM never sees raw PII.

---

#### `pretzel-console/src/lib/sentry.ts` — Sentry error tracking (React, pretzel-console admin app)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** Sentry is initialized with `replaysOnErrorSampleRate: 1.0` — meaning 100% of error sessions are replayed and transmitted to Sentry. The comment `// Clarity handles session replay` explains why `replaysSessionSampleRate: 0`, but the error replay rate remains at 100%. The Pretzel Console is an admin application where users interact with DLP policy management, member lists (including member emails displayed in the UI), and incident analytics (which includes member emails and site URLs). A Sentry session replay of an error in the incidents view could capture member emails, site URLs, and matched terms as rendered in the DOM — transmitting that PII to Sentry's servers.

  Sentry is not mentioned anywhere in the reviewed Security page as a data processor/sub-processor. `tracePropagationTargets` includes `api.mykka.ai`, which means Sentry's distributed tracing will attach trace headers to API calls — potentially tagging API responses that contain PII with Sentry trace IDs.
  **Proposed changes:**
  1. Configure Sentry's `beforeSendReplay` hook to scrub PII from session replays: mask input fields, member email text nodes, and the incidents table before the replay is transmitted. Sentry's privacy masking options (`maskAllText: true` or targeted selectors) should be applied, particularly for the members, incidents, and analytics pages.
  2. Add Sentry to the sub-processor list in the Privacy Policy.
  3. Consider reducing `replaysOnErrorSampleRate` from 1.0 to a lower value (e.g., 0.2) or restricting it to non-PII pages only.

---

#### `pretzel/src/audit/db.ts` — Extension-side audit IndexedDB (local browser storage)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** The extension stores audit events locally in IndexedDB on the user's machine. The schema indices include `hostname`, `action`, `userDecision`, and `timestamp`. The `AuditEvent` type (referenced but not defined in this file) presumably captures which AI site was visited, what action was taken, and when — this is local behavioral data about the employee stored in the browser. From a GDPR standpoint, data stored locally in the browser profile is subject to GDPR if it relates to an identifiable individual (which it does — the browser profile is tied to the employee's device/account). The key concern is: there is no mechanism for an employer-initiated erasure of this local store, and no disclosed retention period for local audit data. Additionally, the corporate Chrome profile is managed by the employer — so the employer's extension has write access to the employee's local browser storage, which raises consent and transparency requirements under GDPR (employees must be informed that the extension stores behavioral data locally). There is also no visible TTL / auto-expiry on the IndexedDB store.
  **Proposed changes:**
  1. Implement a TTL-based purge in the extension: on extension startup or periodically, delete IndexedDB records older than a configurable retention period (e.g., 30 days, matching the server-side retention claim).
  2. Add disclosure in the extension's description and in the employee-facing documentation that the extension stores local audit events in the browser's IndexedDB storage.
  3. Expose a "clear local audit data" action in the extension options page so that employees (or admins via managed policy) can trigger erasure.

---

#### `mykka-web/app/security/page.tsx` — Public security and trust page
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** This page makes four specific claims that the code does not fully support:

  1. **"Prompt content is never stored"** — FALSE as implemented. `events.matchedTerm` stores a verbatim excerpt of prompt content (the matched text fragment). This is a material misrepresentation on a public-facing page that enterprise customers and CISOs will rely on during due diligence. This single claim failure could void a sales cycle or trigger a breach of contract claim if a customer discovers matched terms are stored after signing an MSA that referenced this page.

  2. **"We support data deletion requests within 30 days"** — There is no deletion mechanism in the codebase for `events`, `scans`, or `users`. The claim exists in marketing copy with no corresponding code path. This is an unenforceable GDPR compliance claim.

  3. **"SOC 2 Type II — in progress"** — This claim is acceptable and appropriately qualified ("in progress"). No issue here, assuming the audit has actually been initiated. If it has not, this should be softened to "SOC 2 Type II — planned."

  4. **"GDPR & CCPA ready"** — Given the above gaps (no erasure mechanism, no retention policy, PII transmitted to undisclosed sub-processors), the "GDPR ready" claim is premature. This should be softened to "GDPR-aligned by design" or similar aspirational language until the erasure and sub-processor disclosure gaps are closed.

  **Proposed changes:**
  1. Immediately change "Prompt content is never stored" to accurately reflect what IS stored: "Pretzel records which rule fired, which AI site, and which member triggered the event. For rules configured to report matched content, a brief excerpt of the matched text may be retained for audit purposes. Full prompt text is never stored." This is honest, still compelling, and defensible.
  2. Remove or qualify "We support data deletion requests within 30 days" until a deletion/anonymization mechanism is implemented and tested.
  3. Qualify "GDPR & CCPA ready" pending closure of the sub-processor disclosure and erasure gaps.

---

#### `mykka-web/app/accessibility/page.tsx` — Accessibility statement (Hebrew + English, Israeli Standard 5568)
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** This page is a legal disclosure document, not a data-handling component. It correctly references WCAG 2.1 AA, Israeli Standard 5568, and the Israeli Accessibility Regulations (2013). The contact email `accessibility@mykka.ai` and 5 business-day response commitment are appropriate. The known limitations section is honest about third-party embedded content. No compliance concerns from a data privacy or legal standpoint.
  **Proposed changes:** N/A

---

#### `mykka-web/app/robots.ts` — robots.txt configuration
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Allows all user agents to crawl all paths. No compliance implications — this is a public marketing site with no authenticated or PII-containing pages served by the `mykka-web` package. No issue.
  **Proposed changes:** N/A

---

## Summary Table

| File | Verdict |
|------|---------|
| `audit-log/router.ts` | WARN |
| `audit-log/service.ts` | **ISSUE** |
| `billing/service.ts` | WARN |
| `billing/email.ts` | **ISSUE** |
| `analytics/service.ts` | **ISSUE** |
| `scans/service.ts` | WARN |
| `members/service.ts` | WARN |
| `users/service.ts` | WARN |
| `assistant/llm/anthropic.ts` | **ISSUE** |
| `assistant/llm/openai.ts` | **ISSUE** |
| `assistant/llm/groq.ts` | **ISSUE** |
| `assistant/prompt.ts` | **ISSUE** |
| `pretzel-console/src/lib/sentry.ts` | WARN |
| `pretzel/src/audit/db.ts` | WARN |
| `mykka-web/app/security/page.tsx` | **ISSUE** |
| `mykka-web/app/accessibility/page.tsx` | PASS |
| `mykka-web/app/robots.ts` | PASS |

**PASS: 2 | WARN: 7 | ISSUE: 8**

---

## Top 5 Most Critical Compliance Issues

### 1. "Prompt content is never stored" — The claim is false (`security/page.tsx` + `audit-log/service.ts`)
The `events.matchedTerm` column permanently stores verbatim text excerpts from employee AI prompts. This directly contradicts the most prominent claim on the public Security page. In an enterprise sales cycle, a CISO will verify this claim against the code or the DPA. If they discover the discrepancy post-contract, mykka.ai faces breach of contract liability, potential GDPR Art. 5 violation (purpose limitation and data minimization), and reputational damage. **Fix the claim or fix the code — both need to change in tandem.**

### 2. No GDPR erasure mechanism exists anywhere in the codebase (`audit-log/service.ts`, `members/service.ts`, `users/service.ts`)
The Security page promises deletion requests honored within 30 days. No `DELETE` or anonymization function exists for `events`, `scans`, or `users` rows. Deleting a member leaves their email in `events.memberEmail` (via the FK join) and their scan records intact. This is a live violation of GDPR Art. 17. A single erasure request from an EU data subject that cannot be fulfilled exposes mykka.ai to regulatory complaint and supervisory authority inquiry. **Implement anonymization cascades before any EU enterprise customer signs on.**

### 3. Member PII transmitted to three undisclosed LLM sub-processors (`assistant/prompt.ts`, `llm/*.ts`)
Every use of the AI assistant sends all member emails, DLP rule keywords, and regex patterns to Anthropic, OpenAI, and Groq. None of these are disclosed as sub-processors in the reviewed Security page. Under GDPR Art. 28, sub-processors must be listed and customers must be notified of changes. Under standard enterprise DPA templates (e.g., SCCs), this is a contractual breach. The irony — a DLP product leaking customer PII to AI providers — is a material business risk, not just a legal one. **Remove emails from the LLM prompt immediately; sign DPAs with all three providers; update sub-processor list.**

### 4. Security credentials (org and admin tokens) transmitted in plaintext email (`billing/email.ts`)
The welcome email transmits the org token and admin token — credentials that control DLP policy for an entire organization's Chrome fleet — in the email body over an SMTP connection with no enforcement of TLS certificate verification. Email is not a secure credential delivery mechanism. If these tokens are intercepted, an attacker can silently push arbitrary DLP policies (or disable all policies) to every employee in the customer's organization. **Replace with a one-time authenticated console link.**

### 5. No data retention enforcement across `events` and `scans` tables (`audit-log/service.ts`, `scans/service.ts`)
Both tables grow unboundedly. There is no TTL, no purge job, and no configurable retention window. For SOC 2 Type II, the auditor will ask: "What is your data retention policy and how is it enforced?" The current honest answer is: "We have a policy but no enforcement mechanism." For GDPR, the storage limitation principle (Art. 5(1)(e)) requires that personal data be kept no longer than necessary. Employee behavioral data in `events` and `scans` being retained forever fails this test. **Implement a configurable-per-tenant purge job before SOC 2 audit readiness can be credibly claimed.**

---

*Review prepared by David Horowitz, General Counsel (Fractional) — mykka.ai*
*This document is attorney work product and is privileged and confidential.*
