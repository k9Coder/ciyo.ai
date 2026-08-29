---
status: active
owner: mykka.ai marketing and legal
verified_at: 2026-06-13
sources:
  - app/page.tsx
  - app/product/page.tsx
  - app/pricing/PricingClient.tsx
  - app/security/page.tsx
  - "app/solutions/[industry]/page.tsx"
  - app/privacy/page.tsx
  - app/terms/page.tsx
  - app/accessibility/page.tsx
  - app/about/page.tsx
  - components/sections/Hero.tsx
  - components/sections/HowItWorks.tsx
  - components/sections/FeatureGrid.tsx
  - components/sections/PricingPreview.tsx
  - lib/posts.ts
---

# Content Claims Register

This file separates claims the repository can substantiate from claims that require business, legal, security, compliance, customer, or research evidence. Appearance in source code is not evidence that an external claim is true.

## Review policy

- `code-backed`: implementation in this repository directly supports the claim. Re-check after relevant code changes.
- `external evidence required`: retain only with an owner-approved primary source or internal evidence record.
- `legal review required`: policy, regulatory, contractual, privacy, or compliance language must be approved by counsel or the accountable company owner.
- `time-sensitive`: verify before every material release and whenever pricing, providers, plans, certifications, or operations change.

Do not publish a new quantitative, customer-count, certification, compliance, security-control, retention, residency, pricing, SLA, or legal claim without adding it here.

## Code-backed product claims

| Claim family | Evidence in repository | Limits |
|---|---|---|
| Console supports subjects/rules, org hierarchy, members, audit, publish/history/rollback, analytics, settings, invites, billing status, and assistant workflows. | `pretzel-console/src/App.tsx`, pages, hooks, and API client | Confirms UI/API integration, not production availability or service quality. |
| Console requires a Clerk organization admin for protected routes. | `pretzel-console/src/components/layout/RequireAuth.tsx` | Does not independently prove backend authorization. |
| AI Assistant UI is feature-gated. | `pretzel-console/src/App.tsx`, `PlanGate.tsx` | The gate checks `assistantEnabled`; plan naming and commercial availability require business evidence. |
| Site configuration accepts a domain, input selector, and send-button selector. | `pretzel-console/src/pages/SitesPage.tsx`, API client | Does not prove compatibility with every AI site. |
| Policies can be published and rolled back through the console. | `pretzel-console/src/pages/PublishPage.tsx`, API client, E2E specs | Does not prove propagation time or delivery to every browser. |
| Dashboard and audit UI consume analytics and event endpoints. | Console dashboard/audit pages, hooks, and API client | Does not prove accuracy, retention, or completeness of production data. |

## External evidence required

| Claim currently present | Locations | Required evidence / owner action |
|---|---|---|
| ~~“Now protecting teams at 200+ companies” and trusted-by-industry language~~ | ~~Homepage hero~~ | Resolved 2026-08-25: both lines removed from `components/sections/Hero.tsx` rather than substantiated — no owner-approved customer count existed. |
| Installation in 30 seconds; protected in 30 minutes; assistant actions “in seconds” | Homepage, how-it-works, product, CTAs | Repeatable usability study or approved marketing substantiation. |
| “Every” prompt is intercepted/scanned; works on all AI sites; any internal AI tool | Homepage, feature grid, product | Supported-site matrix and tested limitations. Avoid universal wording without proof. |
| Pricing, limits, trials, included features, “no credit card,” and Enterprise capabilities | Pricing page and preview | Current billing/product configuration approved by product and finance. Verify before every pricing release. |
| Starter kits/templates exist and are included on stated plans | Solutions pages and blog posts | Product inventory and plan-entitlement evidence. Templates themselves are code-backed (`backend/src/db/seeds/profession_templates.ts`: accountant, developer, legal, healthcare — no fintech template exists, closest is accountant); which pricing plans include template access vs. custom-rule authoring vs. the AI assistant is still unverified from this repo alone. |
| Entropy detection, key formats, regex/pattern behavior, alerting, SIEM, SSO/SAML, on-premise option | Product, pricing, solutions, blog | Implemented capability evidence and supported-scope documentation. |
| ~~100,000 prompts analyzed; roughly 1 in 8 prompts contains sensitive data; 1 in 3 developer prompts contains a secret~~ | ~~Blog~~ | Resolved 2026-08-28: `lib/posts.ts` — both blog posts rewritten to drop the specific ratios and the "100,000 prompts analysed" description, replaced with qualitative language ("a meaningful share"). No dated methodology existed to back the numbers. The 1-in-3 developer-prompt ratio on `/solutions/engineering` (`app/solutions/[industry]/page.tsx`) was NOT in scope of this pass — still needs the same treatment or a real methodology. |
| 94% healthcare statistic, 67% legal statistic, and $4.5B fintech statistic | Industry solution pages | Direct links/citations to the named primary reports and confirmation the wording matches them. Note: the equivalent engineering-page stat was replaced 2026-08-28 with a code-backed count (16+ named credential/API-key formats detected, `packages/detect/src/policy/defaults.ts`) rather than an unbacked usage-rate claim — the other three (healthcare/legal/fintech, all citing named third-party reports) were left as-is since they're external citations, not self-reported platform data. |
| ~~Customer-funded, not VC-funded~~ | ~~About page~~ | Resolved 2026-08-28: `app/about/page.tsx` — funding-status claim removed rather than substantiated, replaced with "We're an independent team building the tool we wished existed." |
| Response commitments such as “reply to most,” accessibility within 5 business days, security response within 24 hours/fix within 7 days | About, accessibility, security | Operational owner and measured ability to meet the commitment. |

## Legal, privacy, security, and compliance review required

| Claim currently present | Locations | Review requirement |
|---|---|---|
| Full prompt text is never transmitted/stored; excerpts retained on a rolling 90-day window | Security, privacy, pricing FAQ | Security/privacy architecture and retention-policy verification across backend, extension, logs, vendors, and backups. |
| TLS 1.3, AES-256 at rest, bcrypt token hashing | Security and privacy | Infrastructure and backend security evidence. |
| EU default residency in AWS `eu-west-1` (Ireland) | Security and privacy | Infrastructure-region evidence. Wording corrected 2026-08-20 to match AWS's actual region identity (eu-west-1 = Ireland); evidence that data actually resides there is still required. |
| SOC 2 Type II in progress | Security, privacy, pricing metadata | Compliance-owner confirmation that certification is genuinely in progress. 2026-08-28: the "targeted Q3 2026" date was removed from all 5 locations (`app/privacy/page.tsx`, `app/security/page.tsx` ×2, `public/llms.txt` ×2) rather than kept and risked going stale — Q3 2026 was closing in on its own end date with no confirmed status. Re-add a target date only with a current, owner-confirmed one. |
| GDPR/CCPA aligned, Article 28 DPAs, SCCs, DPA availability | Security and privacy | Legal/privacy approval and executed processor agreements. |
| Named subprocessors and transferred data | Privacy policy | Current vendor inventory and DPAs. Time-sensitive. |
| Retention periods, deletion/anonymization timelines, and rights-response timelines | Privacy policy | Backend/infrastructure enforcement evidence and legal approval. |
| HIPAA-compliant wording, PCI-DSS implications, privilege-waiver statements, and other regulatory guidance | Solutions and blog | Counsel/compliance approval; avoid implying certification or guaranteed compliance. 2026-08-25: `lib/posts.ts` blog posts checked against the same standard. Fixed three posts that named specific "Pretzel [Industry] template" features and claimed shipped rule coverage that doesn't exist in code: the Healthcare post claimed "all five rule categories" pre-configured and "included on all plans" (real template covers 2 of 5: SSN + PHI keywords); the Legal post claimed "pre-configured with rules 1-3" (real template has SSN + privilege keywords only, no matter-number or client-name detection); the Fintech post claimed "The Pretzel Fintech template covers PAN detection, IBAN patterns, and a starter AML keyword set" — **no fintech template exists in the codebase at all** (verified against `backend/src/db/seeds/profession_templates.ts`), this was a fabricated feature claim. All three rewritten to state real template coverage vs. custom-rule-required, consistent with the `/solutions/[industry]` fix above. The Engineering post's claims were checked and left as-is — they match real baseline detection rules (entropy, AWS/GCP key patterns, DB connection strings) in `packages/detect/src/policy/defaults.ts`. 2026-08-20: `/solutions/healthcare`, `/solutions/legal`, `/solutions/fintech` copy rewritten to stop asserting default framework coverage ("blocks all 18 HIPAA-defined PHI identifiers," "PCI-DSS card patterns," "MNPI detection") — verified against `backend/src/db/seeds/profession_templates.ts` and `packages/detect/src/policy/defaults.ts` that only SSN detection + a handful of keywords (healthcare/legal) and Luhn-validated credit-card detection (fintech, baseline-wide) actually ship by default. Copy now states what ships as a starter template vs. what requires a custom rule (via Console UI or the AI assistant). Blog CTA text and blog post content were NOT touched in this pass — still contain HIPAA/PCI framing that should be checked against this same standard. |
| Terms including billing, cancellation, SLAs, governing law, liability, and notice periods | Terms | Counsel approval and consistency with actual contracts/product behavior. |
| Accessibility conformance and support statements | Accessibility page | Accessibility audit and operational owner approval. |

## Immediate inconsistencies and risks

1. ~~The security/privacy copy says data is in AWS `eu-west-1` and calls that Frankfurt.~~ Resolved 2026-08-20: `app/security/page.tsx` now says Ireland, matching the region's actual identity and the page's own FAQ schema. Still requires infrastructure-region evidence confirming eu-west-1 is in fact where data lives (see "Legal, privacy, security, and compliance review required" above) — this entry only fixed the wording contradiction, not the underlying evidence gap.
2. Universal claims such as “every prompt,” “all AI sites,” and “never” exceed what the marketing repository alone can prove.
3. Product and pricing pages advertise capabilities not represented in the console UI, including Slack alerting, SIEM integration, SSO/SAML, and on-premise policy options. They may exist elsewhere, but require accountable evidence.
4. Industry statistics name reports without direct citations or evidence artifacts in this package.
5. Blog posts make regulatory and product-template assertions without an evidence trail.

## Release checklist

Before publishing a claim change:

1. Classify it as code-backed, externally evidenced, or legal/security/compliance reviewed.
2. Record the accountable owner and a primary evidence location outside this repository when required.
3. Check the claim against current pricing, product entitlements, infrastructure, vendor inventory, and contracts.
4. Remove or qualify universal and time-sensitive language when evidence is incomplete.
5. Run `pnpm lint` and `pnpm build`, then manually inspect every affected route.
