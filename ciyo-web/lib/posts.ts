export interface Post {
  slug:        string
  title:       string
  description: string
  date:        string
  tag?:        string
  content:     string
}

export const posts: Post[] = [
  {
    slug: 'ai-prompt-leakage',
    title: '5 Types of Data Your Team Is Accidentally Leaking to ChatGPT',
    description: 'We analysed 100,000 AI prompts. Here\'s what security teams found and how Pretzel stops it.',
    date: '2026-06-01',
    tag: 'Report',
    content: `Every week, your team sends thousands of prompts to ChatGPT, Claude, and Gemini. Most are harmless. But based on data from the Pretzel platform, **roughly 1 in 8 prompts from business users contains at least one piece of sensitive data**.

Here are the five categories we see most often — and what you can do about each one.

## 1. Customer PII

Names, email addresses, phone numbers, and dates of birth appear in prompts when employees ask AI to "draft an email to John Smith at Acme Corp" or "summarise this support ticket." Under GDPR and CCPA, this data cannot be shared with a third party without consent.

**Pretzel rule type:** keyword + pattern matching on email formats, phone formats, and common PII field labels.

## 2. API Keys & Credentials

Developers paste configuration snippets, .env files, and connection strings into AI coding assistants constantly. The AI never "stores" it — but it does use it for training on some platforms.

**Pretzel rule type:** entropy detection. High-entropy strings that match known key formats (AWS, GCP, GitHub PATs) are automatically flagged.

## 3. Financial Data

Card numbers, IBAN codes, account balances, and revenue figures appear in finance team prompts. This is PCI-DSS scope.

**Pretzel rule type:** Luhn-validated card patterns, IBAN regex, and keyword blocks for internal financial terms.

## 4. Client & Matter Names (Legal)

Legal teams asking AI to summarise a deposition or draft a contract clause often include client names and matter numbers — privileged information.

**Pretzel rule type:** Custom keyword blocklist scoped to the Legal team only.

## 5. Internal Project Code Names

Companies use code names for products, M&A targets, and pending announcements. These appear in AI prompts when employees discuss roadmaps or draft announcements.

**Pretzel rule type:** Keyword block on a custom internal code name list.

---

## Download the Free Policy Template

We've compiled all of the above into a ready-to-import Pretzel policy template. Start free and activate it in one click.`,
  },
  {
    slug: 'hipaa-ai-policy-template',
    title: 'HIPAA AI Policy Template: What to Block Before Your Clinical Team Uses ChatGPT',
    description: 'A practical guide to configuring AI DLP for healthcare teams. Covers the 18 HIPAA PHI identifiers and how to enforce them with Pretzel.',
    date: '2026-06-03',
    tag: 'Healthcare',
    content: `Clinical and operations teams at healthcare organisations are using ChatGPT and other AI tools every day — for drafting patient communications, summarising notes, and researching treatments. Without guardrails, protected health information (PHI) ends up in AI training data.

This guide covers the minimum AI usage policy every healthcare organisation should have in place, and how to implement it with Pretzel in under 30 minutes.

## The 18 HIPAA PHI Identifiers

HIPAA's Safe Harbour method defines 18 categories of information that must be de-identified before they can be used or shared. All 18 can appear in AI prompts:

1. Names
2. Geographic data (zip codes, addresses)
3. Dates (except year) — birth dates, admission dates, discharge dates
4. Phone numbers
5. Fax numbers
6. Email addresses
7. Social Security numbers
8. Medical record numbers
9. Health plan beneficiary numbers
10. Account numbers
11. Certificate and licence numbers
12. Vehicle identifiers and serial numbers
13. Device identifiers and serial numbers
14. Web URLs
15. IP addresses
16. Biometric identifiers (fingerprints, voice prints)
17. Full-face photographs
18. Any other unique identifying number or code

## Recommended Pretzel Rules for Healthcare Teams

**Rule 1: SSN and Medical Record Numbers**
Pattern rule matching SSN formats (###-##-####). Action: Block.

**Rule 2: Date of Birth Patterns**
Pattern rule covering common date formats adjacent to demographic keywords. Action: Warn with required justification.

**Rule 3: Patient Name Blocklist**
If your EHR exports a patient roster, import patient names as a keyword blocklist scoped to clinical staff. Action: Block.

**Rule 4: ICD-10 Code Detection**
Pattern rule matching ICD-10 code formats in context of clinical keywords. Action: Warn.

**Rule 5: Insurance Member IDs**
Pattern rule matching common payer formats. Action: Block for external AI sites, Allow for internal tools.

## One-Click Healthcare Template

Pretzel ships with a pre-configured Healthcare policy starter kit covering all five rule categories above. Activate it from the Console in one click, then adjust the scope to your clinical team division.

Start free at ciyo.ai — the Healthcare template is included on all plans.`,
  },
  {
    slug: 'legal-ai-usage-policy',
    title: 'Legal AI Usage Policy: Protecting Attorney-Client Privilege in the Age of AI',
    description: 'How law firms and in-house legal teams can use AI tools without waiving privilege. Includes a practical Pretzel policy template.',
    date: '2026-06-04',
    tag: 'Legal',
    content: `AI tools have transformed legal work. Associates use ChatGPT to draft contract clauses, summarise depositions, and research case law. The efficiency gains are real — but so is the risk.

Pasting privileged communications or confidential client information into a public AI service can, in certain jurisdictions, waive attorney-client privilege. It can also breach client confidentiality obligations under professional conduct rules.

This guide covers what legal teams need to protect and how Pretzel enforces it.

## What to Protect

### Attorney-Client Privileged Communications
Any communication between attorney and client made for the purpose of seeking or providing legal advice is potentially privileged. When that communication is pasted into ChatGPT, you have shared it with a third party — a classic privilege waiver risk.

Pretzel's approach: keyword blocklist on client names and matter numbers, scoped to the legal team. Associates are warned (or blocked) before submitting prompts containing these terms.

### Confidential Client Information
Beyond privilege, lawyers have professional duties of confidentiality that are broader than the attorney-client privilege. Client business plans, financial information, and negotiation strategies that appear in AI prompts can breach these duties even if not technically privileged.

### Work Product
Attorneys' mental impressions, conclusions, and legal strategies prepared in anticipation of litigation are protected work product. Prompts discussing litigation strategy carry work product doctrine risk.

## Recommended Pretzel Rules for Legal Teams

**Rule 1: Matter Number Detection**
Import your firm's matter number format as a regex pattern. Action: Block for external AI, Allow for pre-approved internal tools.

**Rule 2: Client Name Blocklist**
Maintain a keyword blocklist of current client names and matter codenames. Scope to the legal team division. Action: Warn with required approval, or Block.

**Rule 3: Document Classification Markers**
Keyword block on terms like "PRIVILEGED AND CONFIDENTIAL", "ATTORNEY WORK PRODUCT", "CONFIDENTIAL — DO NOT DISTRIBUTE". Action: Block.

**Rule 4: Deposition and Filing Keywords**
Keyword block on party names and case identifiers from active matters. Action: Warn.

## Implementation Notes

- Scope all rules to the Legal team or matter teams only. Other departments should not be affected.
- Use Pretzel's Division hierarchy to separate litigation, transactional, and compliance teams with different policy strictness.
- Review and update the client name blocklist quarterly or after major client roster changes.

The Pretzel Legal template is pre-configured with rules 1-3. Activate it in one click from the Console.`,
  },
  {
    slug: 'fintech-ai-risk-template',
    title: 'Fintech AI Risk Template: Keeping PCI, AML, and Trading Data Out of AI Tools',
    description: 'A practical Pretzel policy template for financial services teams. Covers credit card patterns, AML keywords, and MNPI detection.',
    date: '2026-06-05',
    tag: 'Fintech',
    content: `Financial services teams are among the heaviest users of AI tools — and among the highest-risk from a regulatory standpoint. Finance, compliance, and trading teams use ChatGPT to analyse transactions, draft reports, and model portfolios. Card numbers, account details, and non-public financial information must never reach a third-party AI.

This guide covers the key data categories and how to configure Pretzel to protect them.

## Key Data Categories for Financial Services

### Payment Card Data (PCI-DSS Scope)
Primary Account Numbers (PANs) — credit and debit card numbers — are the core of PCI-DSS scope. Any system that processes, stores, or transmits PANs is in scope. An AI prompt containing a card number is a transmission event.

**Pretzel rule:** Luhn-validated 16-digit card number pattern. Action: Block. No exceptions.

### Bank Account and Routing Numbers
IBAN codes, SWIFT/BIC codes, and US routing and account number combinations appear in finance team prompts when working with payment data.

**Pretzel rule:** IBAN regex pattern and US routing number pattern. Action: Block.

### Material Non-Public Information (MNPI)
For public companies and their advisors, trading on MNPI is securities fraud. Prompts discussing unreported earnings, pending M&A, or regulatory decisions can contain MNPI.

**Pretzel rule:** Keyword blocklist of deal codenames, earnings-period terms, and known pending transaction keywords. Scope to finance and corporate development teams. Action: Warn with required senior approval.

### AML Watchlist Terms
Customer names on sanctions lists, PEP (Politically Exposed Persons) designations, and AML case identifiers should not be pasted into public AI tools.

**Pretzel rule:** Keyword blocklist based on your AML case management system's identifier formats. Action: Block.

## Regulatory Context

Financial regulatory frameworks (PCI-DSS, SOX, FINRA, MiFID II) all have data handling requirements that can be breached by unrestricted AI tool usage. A robust AI usage policy is increasingly expected by regulators during examinations.

Pretzel's audit log provides the evidence trail regulators look for: which employee, which AI site, which rule triggered, what action was taken.

## Activate the Fintech Template

The Pretzel Fintech template covers PAN detection, IBAN patterns, and a starter AML keyword set. Activate it from the Console and customise the MNPI keyword list for your organisation's current deals.`,
  },
  {
    slug: 'engineering-ai-security-starter',
    title: 'Engineering AI Security Starter: Stop Credentials and IP Leaking Through Your Dev Team',
    description: 'How to configure Pretzel to catch API keys, connection strings, and proprietary code before they reach AI coding assistants.',
    date: '2026-06-06',
    tag: 'Engineering',
    content: `Developer adoption of AI coding assistants (GitHub Copilot, Cursor, ChatGPT) has outpaced security policy at most organisations. Developers paste production configs, API keys, database connection strings, and proprietary algorithms into AI tools every day — often without realising the risk.

This guide covers what to protect and how to configure Pretzel's engineering-specific policy rules.

## The Threat: What Developers Actually Paste

Based on patterns observed in the Pretzel platform, the most common sensitive content in developer AI prompts falls into four categories:

### 1. API Keys and Tokens
The single most common finding. Developers copy-paste .env files, config snippets, or Terraform files to ask AI for help — and include live production credentials in the context. AWS access keys, GitHub personal access tokens, Stripe secret keys, database passwords.

**Risk:** If the AI provider retains inputs (standard terms on most free tiers), your production credentials are in their training data or logs.

**Pretzel rule:** High-entropy detection combined with known key format patterns. Pretzel's entropy detector catches keys even when they're not in your keyword list — it looks for strings that are statistically random enough to be a credential.

### 2. Database Connection Strings
A complete database URL contains host, port, username, and password in a single string. These appear in prompts when developers ask AI to help debug queries or schema issues.

**Pretzel rule:** Pattern rule for connection string formats (postgres://, mysql://, mongodb://, and similar). Action: Block.

### 3. Internal Project Names and Codenames
Unreleased product names, M&A target codenames, and internal project identifiers can constitute material non-public information or trade secrets. Discussing an unreleased project's architecture with ChatGPT exposes the project's existence.

**Pretzel rule:** Keyword blocklist of internal codenames. Maintained by your security team and pushed to Pretzel. Action: Warn with justification required.

### 4. Proprietary Algorithms and Business Logic
Novel algorithms, pricing engines, and proprietary models pasted into AI for debugging represent genuine IP risk. Some AI providers claim broad rights to use API inputs.

**Pretzel rule:** This is harder to detect automatically. Consider requiring acknowledgement for prompts over a certain length threshold, or scoping AI assistant access to approved tools only.

## Configuring the Engineering Template in Pretzel

The Pretzel Engineering template includes:
- High-entropy detection (enabled by default for the Engineering subject)
- AWS, GCP, and Azure key format patterns
- Database connection string patterns
- A starter internal project name blocklist (empty by default — populate with your organisation's codenames)

**Scope recommendation:** Apply the entropy detection rules broadly to all engineering staff. Apply the proprietary codename blocklist more selectively to senior engineers and product leads with access to unreleased roadmap information.

## Getting Started

Activate the Engineering template from the Pretzel Console. Add your internal project codenames to the keyword blocklist. Review the audit log after the first week to see what's being caught — and adjust sensitivity as needed.`,
  },
]

export function getPost(slug: string): Post | undefined {
  return posts.find(p => p.slug === slug)
}

export function getAllPosts(): Post[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date))
}
