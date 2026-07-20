# mykka.ai — Staff Index & Routing Guide

> **Agent-routing document only.** Technical reality is defined by code and the
> canonical documentation index at [`../docs/index.md`](../docs/index.md).
> This file tells you who owns a task and where their specialist lens lives.
>
> **Development pipeline** (feature → commit/push flow, QA gates): [`PIPELINE.md`](PIPELINE.md)

---

## Routing Decision Tree

```
Task received
      │
      ▼
 Can you identify the exact specialist?
      │
      ├── YES → Invoke specialist skill directly (see Domain Map below)
      │
      └── NO
            │
            ▼
       Which division does it fall under?
            │
            ├── Engineering / Product     → Marcus Webb (CTO)      staff:marcus-webb
            ├── Sales / Marketing         → Sofia Reyes (VP Sales)  staff:sofia-reyes
            │                               or Priya Nair (Marketing) staff:priya-nair
            ├── Customer Success          → James Okafor (Head CS)  staff:james-okafor
            ├── Security Research         → Alexei Petrov           staff:alexei-petrov
            ├── Security (InfoSec/CISO)   → Noa Katz (CISO)        staff:noa-katz
            ├── Finance / Legal           → Linda Park (CFO)        staff:linda-park
            │                               or David Horowitz (GC)  staff:david-horowitz
            │
            └── Spans 2+ divisions  ──────→ Ethan Cole (CEO)        staff:ethan-cole
                OR company-level
                OR unclear entirely
```

---

## Domain → Specialist Map

Use this to skip the division head and go straight to the right person.

### Engineering

| Task involves... | Specialist | Skill |
|---|---|---|
| Backend API, Fastify routers, PostgreSQL, Drizzle, webhooks, policy compiler | Arjun Mehta | `staff:arjun-mehta` |
| Chrome extension, MV3, content scripts, adapters (ChatGPT/Claude/Gemini), overlay UI | Yuki Tanaka | `staff:yuki-tanaka` |
| Admin console SPA, React, TanStack Query, ChatPane, plan gates, component library | Chloe Dubois | `staff:chloe-dubois` |
| Detection rules, regex patterns, entropy, PII classification, fuzzy matching | Omar Hassan | `staff:omar-hassan` |
| Render/Vercel/GHCR deployment, CI/CD, Docker, PostgreSQL ops, monitoring, secrets | Ryan Kowalski | `staff:ryan-kowalski` |
| E2E test suite, Playwright automation, release gate, detection bypass testing, QA team lead | Natasha Ivanova (QA Lead) | `staff:natasha-ivanova` |
| Manual test plans, Playwright runs against test DB, exploratory testing, UX regression | Lena Hartmann (QA Analyst) | `staff:lena-hartmann` |
| Product roadmap, feature specs, sprint planning, user research, success metrics | Ben Cho | `staff:ben-cho` |
| All engineering — unclear which layer, or cross-cutting (backend + frontend + extension) | Marcus Webb (CTO) | `staff:marcus-webb` |

### Go-to-Market

| Task involves... | Specialist | Skill |
|---|---|---|
| Outbound prospecting, cold sequences, SDR pipeline generation | Jake Morrison | `staff:jake-morrison` |
| Enterprise sales cycle, demos, POCs, contract negotiation, closing | Rachel Kim | `staff:rachel-kim` |
| Technical demos, POC config, security questionnaires, RFP technical sections | Dimitri Stavros | `staff:dimitri-stavros` |
| Blog posts, threat reports, SEO, case studies, white papers, email copy | Megan O'Brien | `staff:megan-obrien` |
| Brand, UI/UX design, Figma, mykka-web visuals, sales decks, report layouts | Carlos Mendes | `staff:carlos-mendes` |
| All sales — unclear, or pipeline/revenue strategy | Sofia Reyes (VP Sales) | `staff:sofia-reyes` |
| All marketing — unclear, or brand/campaign strategy | Priya Nair | `staff:priya-nair` |

### Customer Success

| Task involves... | Specialist | Skill |
|---|---|---|
| Tier 1 support ticket, help center docs, CSAT, basic troubleshooting | Aisha Johnson | `staff:aisha-johnson` |
| Enterprise onboarding, SSO/MDM deployment, policy config, Tier 2 support | Trevor Banks | `staff:trevor-banks` |
| NRR, churn, QBRs, renewals, expansion, health scoring, CS strategy | James Okafor | `staff:james-okafor` |

### Security Research

| Task involves... | Specialist | Skill |
|---|---|---|
| OSINT, dark web monitoring, new data patterns, threat feed analysis | Isabella Torres | `staff:isabella-torres` |
| Detection roadmap, threat reports, conference research, CISO evaluations | Alexei Petrov | `staff:alexei-petrov` |

### Security (InfoSec / CISO)

| Task involves... | Specialist | Skill |
|---|---|---|
| Security program strategy, SOC 2, ISO 27001, CISO customer conversations, board reporting, incident command | Noa Katz (CISO) | `staff:noa-katz` |
| Penetration testing, vulnerability management, AWS security, Israeli INCD/data security levels, SOC 2 technical controls, incident response | Tal Ben-David | `staff:tal-ben-david` |

### Finance & Legal

| Task involves... | Specialist | Skill |
|---|---|---|
| Bookkeeping, payroll, vendor management, HR ops, software licenses | Nina Schulz | `staff:nina-schulz` |
| Financial model, runway, board financials, fundraising prep | Linda Park (CFO) | `staff:linda-park` |
| Enterprise contracts, GDPR/HIPAA/SOC2, legal review, equity (US/EU law) | David Horowitz (GC) | `staff:david-horowitz` |
| Israeli privacy law, Israeli employment law, IIA grants, Section 102 options, PPA registration, cross-border transfers | Yael Mizrahi | `staff:yael-mizrahi` |
| Israeli corporate tax, VAT on SaaS exports, IIA grant accounting, Section 102 tax, Preferred Technology Enterprise | Avi Shapiro (CPA) | `staff:avi-shapiro` |

### Executive

| Task involves... | Specialist | Skill |
|---|---|---|
| Company strategy, fundraising, executive decisions, investor comms, cross-division | Ethan Cole (CEO) | `staff:ethan-cole` |

---

## When to Escalate Up

| Situation | Route to |
|---|---|
| Task spans Engineering + GTM + CS | CEO (`staff:ethan-cole`) |
| Task requires budget decision not in plan | CEO → CFO |
| Task requires signing a contract | CEO + GC (`staff:david-horowitz`) |
| Task requires legal opinion (US/EU) | GC (`staff:david-horowitz`) |
| Task requires Israeli law opinion | Israeli Lawyer (`staff:yael-mizrahi`) |
| Task requires Israeli tax/accounting | CPA (`staff:avi-shapiro`) |
| Task requires security posture decision or incident command | CISO (`staff:noa-katz`) |
| Specialist is blocked by another division | That specialist escalates to their manager; or invoke both managers |
| You genuinely cannot determine the division | CEO (`staff:ethan-cole`) — he routes it |

---

## Full Roster (Quick Reference)

| Name | Title | Division | Skill |
|---|---|---|---|
| Ethan Cole | CEO | Executive | `staff:ethan-cole` |
| Marcus Webb | CTO | Engineering | `staff:marcus-webb` |
| Arjun Mehta | Backend Engineer | Engineering | `staff:arjun-mehta` |
| Yuki Tanaka | Chrome Extension Engineer | Engineering | `staff:yuki-tanaka` |
| Chloe Dubois | Frontend Engineer (Console) | Engineering | `staff:chloe-dubois` |
| Omar Hassan | Detection Engineer | Engineering | `staff:omar-hassan` |
| Ryan Kowalski | DevOps / Platform Engineer | Engineering | `staff:ryan-kowalski` |
| Natasha Ivanova | QA Lead | Engineering | `staff:natasha-ivanova` |
| Lena Hartmann | QA Analyst | Engineering | `staff:lena-hartmann` |
| Ben Cho | Product Manager | Product | `staff:ben-cho` |
| Alexei Petrov | Head of Security Research | Security Research | `staff:alexei-petrov` |
| Isabella Torres | Threat Intelligence Analyst | Security Research | `staff:isabella-torres` |
| Sofia Reyes | VP Sales | Go-to-Market | `staff:sofia-reyes` |
| Rachel Kim | Account Executive | Go-to-Market | `staff:rachel-kim` |
| Jake Morrison | SDR | Go-to-Market | `staff:jake-morrison` |
| Dimitri Stavros | Sales Engineer | Go-to-Market | `staff:dimitri-stavros` |
| Priya Nair | Head of Marketing | Go-to-Market | `staff:priya-nair` |
| Megan O'Brien | Content & SEO Writer | Go-to-Market | `staff:megan-obrien` |
| Carlos Mendes | Designer | Go-to-Market | `staff:carlos-mendes` |
| James Okafor | Head of Customer Success | Customer Success | `staff:james-okafor` |
| Trevor Banks | Implementation Engineer | Customer Success | `staff:trevor-banks` |
| Aisha Johnson | Customer Support Specialist | Customer Success | `staff:aisha-johnson` |
| Linda Park | CFO (Fractional) | Finance & Legal | `staff:linda-park` |
| David Horowitz | General Counsel (Fractional) | Finance & Legal | `staff:david-horowitz` |
| Yael Mizrahi | Israeli & International Tech Lawyer (Fractional) | Finance & Legal | `staff:yael-mizrahi` |
| Avi Shapiro | Israeli CPA / Accountant (Fractional) | Finance & Legal | `staff:avi-shapiro` |
| Nina Schulz | Finance & Ops Manager | Finance & Legal | `staff:nina-schulz` |
| Noa Katz | CISO (Fractional) | Security | `staff:noa-katz` |
| Tal Ben-David | Cybersecurity Specialist | Security | `staff:tal-ben-david` |

---

## Skill Files Location

```
company/staff/
├── executive/          ethan-cole.md
├── engineering/        marcus-webb.md  yuki-tanaka.md  arjun-mehta.md
│                       chloe-dubois.md  omar-hassan.md  ryan-kowalski.md
│                       natasha-ivanova.md  lena-hartmann.md
├── product/            ben-cho.md
├── security-research/  alexei-petrov.md  isabella-torres.md
├── go-to-market/       sofia-reyes.md  priya-nair.md  jake-morrison.md
│                       rachel-kim.md  dimitri-stavros.md  megan-obrien.md
│                       carlos-mendes.md
├── customer-success/   james-okafor.md  trevor-banks.md  aisha-johnson.md
├── finance-legal/      linda-park.md  david-horowitz.md  nina-schulz.md
│                       yael-mizrahi.md  avi-shapiro.md
└── security/           noa-katz.md  tal-ben-david.md
```
