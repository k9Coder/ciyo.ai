---
status: current
owner: ciyo.ai marketing and legal
verified_at: 2026-06-15
sources:
  - ../docs/CURRENT_STATE.md
  - ../docs/KNOWN_ISSUES.md
  - ../pretzel/manifest.config.ts
  - ../pretzel/src
  - ../pretzel-console/src/App.tsx
  - ../backend/src
---

# Content Claims Approval Register

Public claims must appear in this register before publication. Source copy is not evidence. `approved` claims may be published only within the recorded wording family and limits. `prohibited` claims must not appear in public source content. Expired claims return to `pending`.

| Claim ID | Status | Approved wording / claim family | Evidence / source | Owner | Approvers | Approval / expiry |
|---|---|---|---|---|---|---|
| CLM-001 | approved | Authenticated Chrome extension on supported ChatGPT, Claude, and Gemini hosts. | `pretzel/manifest.config.ts`, `pretzel/src/adapters`, `docs/CURRENT_STATE.md` | Product | Product, Engineering | Approved 2026-06-15; review on host changes |
| CLM-002 | approved | Prompt evaluation runs locally using pattern, entropy, dictionary, and score detection. | `pretzel/src/detection`, `docs/CURRENT_STATE.md` | Product | Product, Engineering, Security | Approved 2026-06-15; review on detector changes |
| CLM-003 | approved | Policies can configure warn or block actions. Detection is best-effort. | `pretzel/src/policy`, `pretzel/src/content`, `docs/CURRENT_STATE.md` | Product | Product, Engineering, Security | Approved 2026-06-15; review on enforcement changes |
| CLM-004 | approved | Console supports administration and policy publishing. | `pretzel-console/src/App.tsx`, `docs/CURRENT_STATE.md` | Product | Product, Engineering | Approved 2026-06-15; review on route changes |
| CLM-005 | approved | Scan events and matched excerpts may be reported according to policy configuration. | `docs/KNOWN_ISSUES.md`, backend event APIs, extension reporting code | Security | Security, Privacy, Engineering | Approved 2026-06-15; review on event-model changes |
| CLM-006 | prohibited | Universal or arbitrary-site coverage, including every prompt, any site, or all AI tools. | Manifest-authorized hosts are required; `docs/CURRENT_STATE.md` | Product | Product, Engineering | Prohibited until implementation and approval |
| CLM-007 | prohibited | Customer counts, usage statistics, outcome statistics, or trusted-by claims without primary evidence. | No approved evidence record | Marketing | Marketing, Legal | Prohibited until evidence and approval |
| CLM-008 | prohibited | Unimplemented integrations or features, including Slack alerting, SIEM, SSO/SAML, on-premise policy, and unsupported templates. | `docs/KNOWN_ISSUES.md`, current executable code | Product | Product, Engineering | Prohibited until implementation and approval |
| CLM-009 | prohibited | Residency, compliance, certification, encryption, retention, DPA, subprocessor, response-time, or SLA claims. | No approved legal/security evidence record | Legal / Security | Legal, Security, Privacy | Prohibited until evidence and dated approval |
| CLM-010 | prohibited | Stripe payment claims or fixed pricing/payment-method claims inconsistent with active billing behavior. | Active backend billing uses PayPal; Stripe routes are disabled | Finance | Finance, Product, Legal | Prohibited until billing evidence and approval |

## Release Process

1. Add or update the claim row with evidence, owner, approvers, approval date, and expiry/review trigger.
2. Obtain the listed approvals before changing public copy.
3. Run `pnpm claims:test`, `pnpm claims:check`, `pnpm lint`, and `pnpm build`.
4. Treat checker success as a focused regression gate, not proof that every public claim is approved.

## Checker Scope

`scripts/check-claims.mjs` scans public source content under `app/`, `components/`, and `lib/` for a focused set of known prohibited unsupported phrases. It intentionally excludes this register so prohibited wording can be documented here without failing CI.
