---
status: active
owner: mykka.ai marketing and legal
verified_at: 2026-09-26
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
  - components/sections/HeroDemo.tsx
  - components/sections/HowItWorks.tsx
  - components/sections/FactsStrip.tsx
  - components/sections/ProductParts.tsx
  - components/sections/CTABanner.tsx
  - lib/hero-demo.ts
  - lib/cta.ts
  - lib/config.ts
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

## 2026-09-20 early-access cleanup

Claims removed or corrected because repository evidence contradicted them or none existed. Owner confirmed SOC 2 is not in progress and no DPA exists.

| Claim | Action | Evidence |
|---|---|---|
| SOC 2 Type II in progress | Removed everywhere (`app/security`, `app/privacy`, pricing metadata, `public/llms.txt`). Security page now states no third-party audit exists. | Owner confirmation. |
| DPA available on request; Article 28 DPAs with all sub-processors; SCCs | Removed. Privacy policy now says there is no standard DPA. | Owner confirmation; no executed agreements known. |
| EU data residency, AWS `eu-west-1` | Removed. Security and privacy pages state the database is Neon on AWS `us-east-1`. | Prod `DATABASE_URL` host is `us-east-1.aws.neon.tech`. |
| Backend hosted on Fly.io | Corrected to Render. | `docs/CURRENT_STATE.md` deployment model. |
| Audit-log excerpts deleted on a rolling 90-day window; audit retention by plan (30 days / 12 months) | Corrected. The 90-day purge covers `scans` and `enforcement_signals` only; `events` (which hold `matched_term`) have no automatic expiry. | `backend/src/scans/service.ts` `purgeExpired`. |
| Full prompts never stored; matched excerpt disclosure | Kept the full-prompt claim (extension sends only `matchedText`, only for `rich` rules — `pretzel/src/events/dispatch.ts`). Made the excerpt disclosure explicit on security, pricing FAQ and `llms.txt`. | `dispatch.ts`, `backend/src/events/service.ts`. |
| TLS 1.3, AES-256 | Softened to "HTTPS" and "encrypted by our database provider". Exact TLS version and cipher are set by Render/Vercel/Neon, not this repo. | Not code-backed. |
| Response within 24 hours / fix within 7 days | Softened to "as quickly as we can". | No measured capability. |
| "Customer-funded" in `llms.txt` | Replaced with "independent team", matching the About page fix. | Consistent with 2026-08-28 entry above. |
| Pricing metadata/JSON-LD advertising $49/$15 and a 14-day trial | In pilot mode the pricing page metadata and JSON-LD now describe free early access. | `mykka-web/app/pricing/page.tsx`. |

Still open: privacy policy lists Stripe as the payment processor while the backend bills via PayPal (Stripe routes are disabled); confirm `NEXT_PUBLIC_LOGROCKET_ID` is unset in prod or disclose LogRocket session replay as a sub-processor; governing-law and plan-based retention wording in Terms needs counsel.

## 2026-09-25 web redesign (home page)

Home page rebuilt from the mykka redesign (`Website.dc.html`). `FeatureGrid` and `AEOAnswers` were removed; the FAQ accordion (`faq-data.ts`) now feeds both the visible FAQ and the FAQPage JSON-LD. Removed with them: "Works on All AI Sites" (Perplexity / any internal tool) and "30 seconds"/"30 minutes" install/setup claims on the home page (other pages still carry them).

| Claim | Location | Status |
|---|---|---|
| "Publishing sends the policy to every browser within minutes" | `HowItWorks.tsx` | Code-backed for the two-minute policy update alarm (`pretzel/src/background/README.md`); delivery to every browser is not proven. Time-sensitive. |
| "Fails open… console shows a 'protection degraded' alert" | `faq-data.ts` | Code-backed: `pretzel/src/content/content-script.ts` (fail open), `pretzel-console/src/components/layout/EnforcementBanner.tsx`. |
| "Detection runs on the device / inside the browser" | Hero, FAQ | Code-backed (`packages/detect`). Matched excerpts can reach the console for `rich` rules; FAQ answer states report levels. |
| "The admin sees the rule, site and time, not the full prompt" | `HeroDemo.tsx` | Consistent with the 2026-09-20 full-prompt entry; excerpt disclosure depends on report level. |
| Detection types and Blocks/Warns examples (patterns, entropy, keyword lists) | `WhatItCatches.tsx` | Code-backed detectors (`packages/detect`); example outcomes are illustrative, each rule's action is admin-configured. |
| Console preview figures (27 / 64 / 4,812, 38 of 45, attention items) | `ConsolePreview.tsx` | Illustrative sample data, labelled "Sample data". Not real usage. |
| "Northwind Legal", John Doe demo | `HeroDemo.tsx` | Fictional demo content. |
| "Chrome Enterprise push", "people sign in with their work account" | `HowItWorks.tsx` | External evidence required (Chrome Enterprise deployment is not verified in this repo). |
| "Free for 3 people" / "Free during early access" | `FactsStrip.tsx`, `PricingPreview.tsx` | Follows `IS_PILOT_MODE`; same limits as the existing Solo tier. |

## 2026-09-26 home page v2 (`Website.dc.html`)

Home page rebuilt again from the updated design: scripted three-scenario demo, browser-and-desktop framing, "Four parts, one policy", industries list, Discord card, pilot CTAs, new header (Solutions menu) and footer. Removed from the home page: What it catches, Console preview (sample figures), Pricing preview, the FAQ accordion and the FAQPage JSON-LD (`faq-data.ts`), and the unused `VideoDemo`. The claims those carried are no longer published on `/`.

| Claim | Location | Status |
|---|---|---|
| "Pilot: free, up to 50 people, no cap on scans" | `lib/cta.ts` (`PILOT_TERMS`), `Hero.tsx`, `CTABanner.tsx` | Code-backed: `pilot` plan in `backend/src/billing/limits.ts` (`maxSeats: 50`, `monthlyScans: -1`). The design says "no limits on people or scans"; that is not true of the backend, so the site states the real cap. Product owner to decide whether to lift the seat cap or keep this wording. Time-sensitive. |
| "Free for teams up to 3 users" (non-pilot metadata/JSON-LD) | `app/page.tsx` | Unchanged; only when `NEXT_PUBLIC_PILOT_MODE` is not `true`. |
| "Chrome extension and a Windows / Mac app" | `FactsStrip.tsx`, JSON-LD `operatingSystem` | Code-backed: `pretzel-desktop/build/electron-builder.yml` builds mac and win (and linux; the design lists only Windows / Mac). |
| "Admins see the rule and site, not the text" | `FactsStrip.tsx` | Same limits as the 2026-09-20 full-prompt entry: matched excerpts can reach the console for `rich` rules; the Security page states the report levels. Shortened from the design line, verify wording. |
| "Covers AI desktop apps. Lives in the tray and asks before anything risky is sent." | `ProductParts.tsx` | Code-backed for the tray and the decision window (`pretzel-desktop`); which desktop apps are covered is not evidenced here (the proxy watches ChatGPT, Claude and Gemini hosts, see `isMonitoredHost` in `pretzel-desktop/electron/proxy.ts`). Wording is the design's; external evidence required for "AI desktop apps". |
| Demo prompts, "Northwind Legal", "Dana", fake SSNs / card / key | `lib/hero-demo.ts` | Fictional demo content, labelled "demo". The AWS key is not a real credential shape (unit-tested). Outcomes are illustrative: each rule's action is admin-configured. |
| "Publishing sends the policy to every device within minutes" | `HowItWorks.tsx` | Extension: two-minute policy poll (`pretzel/src/background/README.md`). Desktop app sync interval not re-verified here. Delivery to every device is not proven. Time-sensitive. |
| "Start from a preset for your industry, or ask the assistant" | `HowItWorks.tsx` | Templates are code-backed only for accountant, developer, legal, healthcare (see the starter-kit row above); no fintech template. |
| Discord community invite `https://discord.gg/mykka` | `lib/config.ts` | Taken from the design; not verified in this repo. Owner to confirm the invite is live and permanent. |

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
