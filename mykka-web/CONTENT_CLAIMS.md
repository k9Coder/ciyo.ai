---
status: active
owner: ciyo.ai marketing and legal
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
| “Now protecting teams at 200+ companies” and trusted-by-industry language | Homepage hero | Current customer/tenant count and permission to characterize customers. |
| Installation in 30 seconds; protected in 30 minutes; assistant actions “in seconds” | Homepage, how-it-works, product, CTAs | Repeatable usability study or approved marketing substantiation. |
| “Every” prompt is intercepted/scanned; works on all AI sites; any internal AI tool | Homepage, feature grid, product | Supported-site matrix and tested limitations. Avoid universal wording without proof. |
| Pricing, limits, trials, included features, “no credit card,” and Enterprise capabilities | Pricing page and preview | Current billing/product configuration approved by product and finance. Verify before every pricing release. |
| Starter kits/templates exist and are included on stated plans | Solutions pages and blog posts | Product inventory and plan-entitlement evidence. |
| Entropy detection, key formats, regex/pattern behavior, alerting, SIEM, SSO/SAML, on-premise option | Product, pricing, solutions, blog | Implemented capability evidence and supported-scope documentation. |
| 100,000 prompts analyzed; roughly 1 in 8 prompts contains sensitive data; 1 in 3 developer prompts contains a secret | Blog and engineering solution | Dated methodology, sample definition, anonymization review, and reproducible analysis. |
| 94% healthcare statistic, 67% legal statistic, and $4.5B fintech statistic | Industry solution pages | Direct links/citations to the named primary reports and confirmation the wording matches them. |
| Customer-funded, not VC-funded | About page | Company-owner confirmation. |
| Response commitments such as “reply to most,” accessibility within 5 business days, security response within 24 hours/fix within 7 days | About, accessibility, security | Operational owner and measured ability to meet the commitment. |

## Legal, privacy, security, and compliance review required

| Claim currently present | Locations | Review requirement |
|---|---|---|
| Full prompt text is never transmitted/stored; excerpts retained on a rolling 90-day window | Security, privacy, pricing FAQ | Security/privacy architecture and retention-policy verification across backend, extension, logs, vendors, and backups. |
| TLS 1.3, AES-256 at rest, bcrypt token hashing | Security and privacy | Infrastructure and backend security evidence. |
| EU default residency in AWS `eu-west-1` / Frankfurt | Security and privacy | Infrastructure-region evidence; note that AWS `eu-west-1` is Ireland, not Frankfurt. Resolve wording before publication. |
| SOC 2 Type II in progress, targeted Q3 2026 | Security, privacy, pricing metadata | Compliance-owner confirmation and current target date. Time-sensitive. |
| GDPR/CCPA aligned, Article 28 DPAs, SCCs, DPA availability | Security and privacy | Legal/privacy approval and executed processor agreements. |
| Named subprocessors and transferred data | Privacy policy | Current vendor inventory and DPAs. Time-sensitive. |
| Retention periods, deletion/anonymization timelines, and rights-response timelines | Privacy policy | Backend/infrastructure enforcement evidence and legal approval. |
| HIPAA-compliant wording, PCI-DSS implications, privilege-waiver statements, and other regulatory guidance | Solutions and blog | Counsel/compliance approval; avoid implying certification or guaranteed compliance. |
| Terms including billing, cancellation, SLAs, governing law, liability, and notice periods | Terms | Counsel approval and consistency with actual contracts/product behavior. |
| Accessibility conformance and support statements | Accessibility page | Accessibility audit and operational owner approval. |

## Immediate inconsistencies and risks

1. The security/privacy copy says data is in AWS `eu-west-1` and calls that Frankfurt. AWS identifies `eu-west-1` as Europe (Ireland); Frankfurt is `eu-central-1`.
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
