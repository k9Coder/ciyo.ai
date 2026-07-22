export interface Post {
  slug:        string
  title:       string
  description: string
  date:        string
  tag?:        string
  author?:     string
  content:     string
}

export const posts: Post[] = [
  {
    slug: 'what-is-ai-dlp',
    title: 'What is AI DLP? The Complete Guide to AI Data Loss Prevention',
    description: 'AI DLP (AI Data Loss Prevention) stops employees from sending sensitive data to ChatGPT, Claude, and Gemini. This guide explains how it works, why traditional DLP fails, and what to look for in an AI DLP solution.',
    date: '2026-07-05',
    tag: 'Guide',
    content: `AI tools have created a data leakage problem that traditional security tools were never built to solve. This guide explains what AI DLP is, why it matters, and how to evaluate your options.

## What is AI DLP?

AI DLP — Artificial Intelligence Data Loss Prevention — is a category of security software that prevents employees from sending sensitive organizational data to AI tools and large language models (LLMs). As ChatGPT, Claude, Gemini, and other generative AI tools became standard in the workplace, organizations face a new class of data leakage risk: employees pasting customer PII, source code, financial records, legal documents, and credentials directly into AI chat interfaces. Traditional DLP solutions were designed for email, file transfers, and USB devices — they cannot intercept browser-based AI prompt submissions. AI DLP tools close this gap by monitoring and blocking sensitive content at the point of input, before a prompt reaches the AI provider's servers.

## Why Traditional DLP Fails for AI Tools

Most enterprise DLP solutions were architected in the early 2010s for a world of email attachments, USB drives, and file servers. They operate at the network perimeter or inside email gateways — places where data flows are predictable and inspectable.

AI prompts are fundamentally different:

- **HTTPS encrypted in transit.** Network DLP cannot read HTTPS traffic without complex TLS inspection setups that break modern web applications and require significant IT overhead.
- **Browser-originated.** Prompts are typed or pasted in the browser and submitted via standard HTTPS POST requests — indistinguishable from normal web traffic at the network level.
- **Real-time and conversational.** Traditional DLP policies were written for documents and attachments. AI prompts are short, fast, and freeform — existing policy logic doesn't translate.
- **No file signature.** There is nothing to hash or fingerprint. The sensitive content is typed text, not a file.

The result: **your existing DLP solution sees nothing when an employee pastes a database password into ChatGPT.**

## How Big Is the AI Data Leakage Problem?

Based on data from the Pretzel platform, **roughly 1 in 8 prompts from business users contains at least one piece of sensitive data**. For developer teams specifically, that ratio rises sharply: **approximately 1 in 3 developer prompts contains a credential, API key, or piece of proprietary code**.

The most common categories:

| Data type | Typical source |
|---|---|
| Customer PII (names, emails, SSNs) | Support, HR, customer success prompts |
| API keys and credentials | Developer prompts — .env files, configs |
| Financial data (card numbers, IBANs) | Finance team prompts |
| Proprietary source code | Developer coding assistant use |
| Legal case details and client names | Legal team prompts |

These are not hypothetical risks. They are patterns observed daily across organizations using AI tools without guardrails.

## How AI DLP Works

### Browser-Native AI DLP

The most effective AI DLP approach operates inside the browser, intercepting prompts before they are submitted — before any data leaves the user's device.

A browser extension sits between the user's keystrokes and the AI tool's send button. When a user types or pastes content into ChatGPT, Claude, or Gemini and clicks submit, the extension intercepts the prompt and runs it through a policy engine. If a violation is detected, the submission is blocked and the user is shown exactly what was caught. The entire process happens locally — the full prompt text never reaches the DLP vendor's servers.

This approach has three significant advantages:
1. **No network changes required.** No proxy, no SSL inspection, no infrastructure.
2. **Full prompt visibility.** The extension reads the unencrypted text before it is sent — the only point where it is fully readable.
3. **Instant deployment.** Employees install a browser extension. That is the entire IT change.

### Network-Level AI DLP

Some vendors attempt to add AI monitoring to existing network DLP or CASB platforms. This approach requires TLS inspection — decrypting and re-encrypting HTTPS traffic at a proxy — which introduces significant operational complexity and can break modern web applications that use certificate pinning.

Network-level solutions also see only what the network sees: encrypted bytes. They cannot read prompt content without decryption infrastructure that most organizations are not willing or able to deploy at scale.

### API-Level AI DLP

A third approach involves routing AI API calls through a middleware layer that inspects prompts before forwarding them to the AI provider. This works for organizations that have built internal AI tools using the OpenAI or Anthropic APIs, but it does not apply to consumer interfaces — employees using chat.openai.com directly bypass API-level controls entirely.

## Key Capabilities to Evaluate in an AI DLP Solution

When evaluating AI DLP tools, look for:

**Detection accuracy.** Pattern matching for known formats (SSNs, credit card numbers, IBANs) is table stakes. Entropy-based detection for credentials and API keys — which catch secrets your keyword list doesn't know about — is a meaningful differentiator. False positive rate matters: an AI DLP tool that blocks too aggressively gets disabled by employees.

**Policy granularity.** A single global policy is not enough. Healthcare teams need different rules than engineering teams. An AI DLP solution should support team-scoped, division-scoped, and user-scoped policies with different actions (block, warn, log-only).

**Audit trail.** For GDPR, HIPAA, PCI-DSS, and SOC 2 compliance purposes, you need a full log of every blocked event: who sent it, when, what site, what rule triggered, what action was taken. Audit logs must be tamper-evident and retained for a sufficient period.

**Admin experience.** Security teams should be able to define policies in plain English, not regex. An AI-assisted policy editor that translates natural language rules into detection logic reduces the time-to-protection from days to minutes.

**Coverage.** At minimum, the solution should work on ChatGPT, Claude, and Gemini — the three highest-volume AI tools in enterprise environments. Support for additional sites (Perplexity, internal AI tools via custom selectors) is a plus.

## AI DLP by Industry

Different industries face different regulatory and risk contexts:

- **[Healthcare](/solutions/healthcare):** HIPAA's 18 PHI identifiers can appear in clinical AI prompts. Patient names, SSNs, medical record numbers, and dates of birth must be blocked.
- **[Legal](/solutions/legal):** Attorney-client privilege can be waived when privileged communications are shared with a third-party AI. Client names, matter numbers, and work product markers require keyword blocking.
- **[Fintech](/solutions/fintech):** PCI-DSS card number patterns, IBAN codes, and material non-public information (MNPI) all require blocking. Regulatory examiners increasingly expect an AI usage policy with an audit trail.
- **[Engineering](/solutions/engineering):** API keys, database connection strings, and proprietary algorithms are the highest-risk categories for development teams. Entropy detection is essential.

## Getting Started with AI DLP

**Step 1: Assess your exposure.** Before deploying controls, understand what data is actually being sent to AI tools. A short monitoring-only deployment (log-only mode, no blocking) gives you a factual baseline.

**Step 2: Define a policy.** Start with the data categories that create regulatory liability: PII under GDPR/CCPA, PHI under HIPAA, card data under PCI-DSS. Add credential detection for engineering teams. You can add more rules later. → Use our [AI Acceptable Use Policy template](/blog/ai-acceptable-use-policy-template) as a ready-made starting point.

**Step 3: Start with warn, escalate to block.** A warn action — showing employees what was detected without blocking the prompt — builds awareness before enforcement. Escalate to blocking after employees understand the policy.

**Step 4: Set up audit logging.** Make sure every blocked and warned event is logged with sufficient detail for compliance purposes. Know your retention requirement before you configure.

**Step 5: Review and adjust.** Check the audit log weekly in the first month. False positives (legitimate content blocked incorrectly) will tell you where to tune. High-volume violations will tell you where to invest in training.

---

Pretzel is a browser-native AI DLP solution built for this workflow. It installs in under a minute, runs detection locally, and gives security administrators a central console for policy management, publishing, and audit. [Start free](/download) — no credit card, no IT ticket, no network change required.`,
  },
  {
    slug: 'generative-ai-governance',
    title: 'Generative AI Governance: A Framework for Enterprise Security Teams',
    description: 'How to build a generative AI governance program that covers policy, technical enforcement, audit, and employee training — without blocking the productivity gains your business already depends on.',
    date: '2026-07-08',
    tag: 'Framework',
    content: `Generative AI governance is the set of policies, controls, and processes an organization uses to manage how employees use AI tools — what data they share with them, which tools are approved, and how compliance is enforced and audited.

This is not a theoretical exercise. Most organizations already have a governance gap: employees are using AI tools daily, and the security and compliance infrastructure has not caught up. This guide provides a working framework to close that gap.

## What Is Generative AI Governance?

Generative AI governance is the organizational discipline of managing AI tool usage across the enterprise. It encompasses:

- **Policy** — defining what data may and may not be submitted to AI tools, and which tools are approved
- **Technical enforcement** — controls that enforce policy at the point of use, not just in writing
- **Audit and visibility** — logging what is submitted, what is blocked, and what decisions were made
- **Training and awareness** — ensuring employees understand the policy and the risks

Governance differs from AI safety (preventing AI from producing harmful outputs) and from AI model governance (managing the lifecycle of internal AI models). Generative AI governance is specifically about how employees interact with external AI services using organizational data.

## Why Governance Is Now a Board-Level Issue

Three converging pressures have elevated AI governance from an IT concern to a board-level issue:

**Regulatory scrutiny.** Data protection regulators in the EU and US have begun issuing guidance on AI tool usage. Submitting personal data to public AI services without a lawful basis and appropriate data processing agreements creates GDPR and CCPA exposure. Healthcare and financial services regulators have followed with sector-specific guidance.

**Insurance requirements.** Cyber insurance underwriters are increasingly asking about AI usage policies in renewal questionnaires. Organizations without documented controls may face premium increases or coverage exclusions.

**Incident liability.** When an employee submits customer PII to a public AI tool and that data appears in an AI-generated response to another user, the organization — not the AI vendor — bears the regulatory and legal liability. The insurance and legal risk of uncontrolled AI usage is no longer hypothetical.

## The Five Components of a Generative AI Governance Program

### 1. Approved Tool Registry

Maintain an explicit list of approved AI tools and the conditions under which each is approved. The registry should include:

- Tool name and URL
- Approved use cases
- Data handling restrictions
- Whether a Data Processing Agreement (DPA) is in place with the vendor
- Review date

Tools not on the registry are not approved. Employees who need to use an unlisted tool submit a request; security evaluates and adds it or declines. The registry is the single source of truth for what is permitted.

### 2. Data Classification for AI

Your existing data classification scheme — typically Public, Internal, Confidential, Restricted — needs to be extended with AI-specific guidance. For each classification level, define:

- May this data be submitted to approved AI tools?
- Under what conditions?
- Which employee roles may make exceptions?

Most organizations find that Restricted data (PHI, PCI-DSS card data, legal privilege) must never be submitted to public AI. Confidential data (customer PII, financial records, proprietary IP) requires explicit authorization or tool-level controls. Internal data can generally be submitted with appropriate approved tools. Public data is unrestricted.

### 3. Technical Enforcement at the Point of Input

Policy without technical enforcement relies entirely on individual judgment under time pressure. This is not a reliable control.

Browser-native AI DLP tools intercept prompts before submission and enforce policy automatically. When an employee attempts to submit data classified as Restricted, the submission is blocked. When Confidential data is detected, the employee receives a warning and must make a conscious decision. Low-risk submissions are logged and allowed.

Technical enforcement should operate at the browser level — where the data actually enters the AI tool — not at the network level, which requires TLS inspection infrastructure and misses remote workers.

### 4. Audit Log and Compliance Evidence

Every enforcement event — block, warn, allow — should be logged with: timestamp, user identifier, AI tool, rule triggered, action taken. This log serves three purposes:

**Policy calibration.** High-frequency false positives tell you where your rules are misconfigured. High-frequency violations in a specific team tell you where training is needed.

**Incident investigation.** When an incident occurs — a regulator asks questions, a customer complains — the audit log tells you what happened, when, and who was involved.

**Compliance evidence.** Regulators and auditors increasingly ask for evidence of AI governance controls. An audit log with 12+ months of retention is the evidence they accept.

### 5. Review Cycle

Generative AI governance is not a one-time project. It requires a quarterly review cycle covering:

- New AI tools adopted since the last review — add to registry or deny
- New data categories at risk — update classification guidance
- Audit log analysis — false positive rates, violation trends, team-specific patterns
- Regulatory updates — new guidance from data protection authorities and sector regulators
- Employee feedback — where controls create friction without proportionate benefit

## Implementation Roadmap

**Month 1:** Assemble the governance team (CISO, Legal, HR, a business sponsor). Draft the approved tool registry and data classification extension. Deploy technical enforcement in monitor-only mode.

**Month 2:** Analyze monitor data. Publish policy. Enable enforcement for highest-risk data categories (Restricted). Train employees. Enable warn for Confidential data.

**Month 3:** Review audit data. Adjust false positive rates. Identify and address high-violation teams. Expand enforcement scope.

**Quarter 2:** First governance review cycle. Update registry, classification guidance, and enforcement rules based on three months of operational data. Report to board on AI risk posture.

**Ongoing:** Quarterly reviews, annual policy refresh, continuous monitoring.

## Common Governance Failures

**Policy without enforcement.** A memo saying "do not submit customer data to AI tools" is not a control. It is an aspiration. Employees operating under time pressure will not always consult the policy before pasting a customer record into ChatGPT.

**Enforcement without exceptions.** No governance program survives without a workable exceptions process. Define who can approve exceptions, under what conditions, and how exceptions are logged. Without this, employees route around controls rather than engaging with them.

**Governance without training.** Technical controls handle the automated cases. Training handles the edge cases: novel use patterns, social engineering, employees who find clever workarounds. Controls and training are complementary, not substitutes.

**Starting with a block-everything posture.** Organizations that begin by blocking all AI access typically see rapid shadow IT adoption. Employees find unapproved tools on personal devices. You have moved the risk from a visible channel to an invisible one. Start with the highest-risk data categories and build from there.

---

Pretzel implements the technical enforcement layer of this governance framework: browser-native prompt interception, centralized policy management, team-scoped rules, and a full audit trail. [Learn how it works](/product) or [start free](/download) — no network changes, no IT infrastructure required.`,
  },
  {
    slug: 'ai-dlp-vs-network-dlp',
    title: 'AI DLP vs Network DLP: Why Traditional Data Loss Prevention Misses AI Prompts',
    description: 'Network DLP cannot intercept browser-submitted AI prompts without TLS inspection. This guide explains the architectural difference, why it matters, and what browser-native AI DLP does instead.',
    date: '2026-07-07',
    tag: 'Technical',
    content: `Organizations that already have data loss prevention (DLP) deployed often assume they are protected against AI data leakage. They are not. The architectural gap between traditional network DLP and the way employees interact with AI tools is significant — and widely misunderstood.

This guide explains why network DLP misses AI prompts, how browser-native AI DLP works differently, and how to evaluate which approach fits your environment.

## How Traditional Network DLP Works

Network DLP operates at the perimeter between your corporate network and the internet. All outbound traffic passes through a gateway or proxy, where it is inspected for sensitive content before being forwarded to its destination.

For this inspection to work on HTTPS traffic — which is all modern web traffic, including AI tools — network DLP must perform TLS inspection: decrypting the traffic at the proxy, reading it, then re-encrypting it before forwarding. Without TLS inspection, the gateway sees only encrypted bytes — it cannot read the content of the request.

Network DLP was designed for an earlier threat model: employees emailing customer lists to personal accounts, uploading documents to unauthorized cloud services, copying files to USB drives. For these use cases, it works well. The data flows through predictable channels with inspectable payloads.

## Why Network DLP Fails for AI Prompts

AI tool usage breaks the assumptions network DLP was built on in four ways.

### 1. TLS 1.3 with Forward Secrecy

Modern TLS 1.3 uses ephemeral key exchange, meaning each session uses a unique cryptographic key that is never stored. A proxy performing TLS inspection must break the end-to-end encryption by acting as a man-in-the-middle — presenting its own certificate to the client and a separate session to the server.

This is technically possible but creates two problems: it requires deploying a custom CA certificate to every managed device (a significant IT operation), and it breaks applications that use certificate pinning or other certificate verification mechanisms. Some AI tools and supporting services verify certificate chains in ways that detect and reject proxy interception.

### 2. Remote Workers and Unmanaged Devices

Network DLP only sees traffic that routes through the corporate proxy. Remote workers on home networks, employees on personal laptops, and contractors on unmanaged devices bypass the corporate proxy entirely. In a hybrid work environment — which describes most enterprise organizations today — network DLP coverage is partial by design.

A ChatGPT prompt submitted from a developer's home office on their work laptop routes over residential internet directly to OpenAI. Your network DLP never sees it.

### 3. The Data Is in the Request Body

AI prompt content is submitted in the HTTP request body — a JSON payload sent to the AI provider's API endpoint. Even with TLS inspection in place, the gateway must parse this specific request format, identify the prompt field within the JSON structure, and evaluate its content against policy rules. Network DLP tools built for email and file uploads often lack the application-layer parsing logic needed to extract prompt content from AI API calls.

### 4. Consumer-Facing Interfaces vs APIs

API-level DLP tools — which route AI API calls through a middleware layer — work for organizations that have built internal AI applications using vendor APIs. They do not apply to employees using chat.openai.com, claude.ai, or gemini.google.com directly. Browser-based consumer interfaces submit prompts over standard HTTPS from the user's browser. There is no API call your middleware can intercept.

## How Browser-Native AI DLP Works

Browser-native AI DLP operates inside the web browser, at the point where the user submits a prompt — before any data leaves the device.

A browser extension sits in the execution path between the user's input and the AI tool's send button. When the user types or pastes content and clicks submit, the extension intercepts the action, reads the full prompt text, evaluates it against your policy, and either allows, warns, or blocks the submission.

Because this interception happens before the HTTP request is constructed and sent, the extension has access to the complete, unencrypted prompt content. There is no encryption to break. There is no proxy required.

The policy engine runs locally in the browser extension. Detection logic — pattern matching, entropy analysis, keyword checking — executes on the user's device. The full prompt text never leaves the browser before the policy decision is made.

### What Is Transmitted

After the policy decision is made, the extension sends a minimal event record to the backend: which rule triggered, which AI site, which user, what action was taken. For rules configured to capture matched content, a brief excerpt of the matched text may be included for audit purposes. The full prompt text is not transmitted.

## Side-by-Side Comparison

| Dimension | Network DLP | Browser-Native AI DLP |
|---|---|---|
| Where it operates | Network perimeter (proxy/gateway) | Inside the browser, at the prompt |
| Requires TLS inspection | Yes — cannot read HTTPS without it | No — reads prompt before encryption |
| Coverage on remote workers | Partial — only corporate network | Full — runs on the device |
| Deployment | Network infrastructure change | Browser extension install |
| Coverage for consumer AI interfaces | Limited without per-app parsing | Yes — works on any AI site |
| Coverage for API-based AI tools | Possible via middleware | No — browser-only |
| False negative risk for AI prompts | High — many bypass scenarios | Low — intercepts at input |

## When Network DLP Adds Value

Network DLP is not obsolete. For use cases it was designed for — unauthorized file uploads, email data exfiltration, USB transfers — it remains effective. Organizations with mature network DLP programs should keep them running.

For AI prompt security specifically, network DLP provides a useful secondary layer when TLS inspection is fully deployed and covers remote workers via VPN or ZTNA. It catches egress patterns — volume of traffic to AI endpoints, frequency of large payload submissions — that can signal policy violations even without content inspection.

The key point is that network DLP alone is not sufficient for AI prompt security, and in most organizations it catches very little of the actual AI data leakage occurring today.

## Choosing the Right Approach

**If your organization has full TLS inspection deployed and all employees route through the corporate proxy:** Network DLP may catch some AI prompt content, but application-layer parsing for AI-specific request formats may still be a gap. Browser-native DLP adds precision and coverage for remote workers.

**If your organization has partial TLS inspection or significant remote work:** Browser-native AI DLP is the primary control. Network DLP remains useful for other use cases but is not reliable for AI prompts.

**If you are building internal AI applications on top of vendor APIs:** API-level DLP middleware is appropriate for that surface. Browser-native DLP covers the consumer-interface risk that API middleware cannot reach.

For most enterprise organizations, the answer is browser-native AI DLP as the primary control for AI prompt security, with existing network DLP continuing to serve its original use cases.

---

Pretzel is a browser-native AI DLP solution that operates at the point of prompt submission — no TLS inspection, no proxy, no network changes. [See how it works](/product) or [read the complete AI DLP guide](/blog/what-is-ai-dlp).`,
  },
  {
    slug: 'employee-ai-security-policy',
    title: 'How to Stop Employees from Leaking Sensitive Data to AI Tools',
    description: 'A practical guide for security teams building controls around employee AI tool usage. Covers what data is at risk, how to enforce policy without killing productivity, and how to deploy without network changes.',
    date: '2026-07-06',
    tag: 'Guide',
    content: `Most organizations already know they have an AI data leakage problem. The harder question is how to solve it without triggering a wave of shadow IT, employee pushback, or IT overhead.

This guide covers how to build practical controls around employee AI tool usage — starting from the real risk, not the theoretical one.

## What Employees Are Actually Doing

Before building controls, understand what you are controlling.

Employees use AI tools to make their jobs faster. The most common work patterns observed across organizations:

- **Support and operations teams** paste customer records, ticket details, and account information into AI to draft responses or summarize issues
- **Developers** paste code — including configuration files and .env snippets — into AI coding assistants to debug or get feedback
- **Finance teams** paste transaction data, account details, and financial figures into AI for analysis and report drafting
- **HR and legal teams** paste employment records, client communications, and document excerpts for summarization and drafting

In every case, employees are not being careless — they are doing their job efficiently. The sensitive data leakage is incidental to a legitimate task. Your controls need to account for this: block the data, not the workflow.

## The Four Failure Modes of AI Policy Without Controls

**1. Policy memos without enforcement.** Telling employees not to paste sensitive data into AI tools is not a control. Without technical enforcement, compliance relies entirely on individual judgment under time pressure. It will fail.

**2. Blocking all AI tools.** CISOs who attempt to block access to ChatGPT at the network level report the same outcome: employees switch to mobile data, use personal laptops, or find other unapproved AI tools. You have moved the leakage from a visible channel to an invisible one.

**3. TLS inspection without coverage.** Network-level TLS inspection catches some AI traffic but misses users on personal networks, VPN splits, and any device not routing through the corporate proxy. It also introduces significant IT overhead and can break modern web applications.

**4. Overly broad rules that trigger on legitimate content.** AI DLP tools that block too aggressively generate employee frustration and workarounds. The goal is precision: block the data that creates liability, allow the workflow that creates value.

## What Good Controls Look Like

Effective AI data leakage controls have three properties:

**Point-of-input enforcement.** Controls operate where data enters the AI tool — inside the browser, before the prompt is submitted. This is the only point where the full unencrypted prompt text is available to inspect. Network-level controls operate after encryption and miss browser-originated submissions without TLS inspection infrastructure.

**Policy precision.** Block specific data categories, not AI tools broadly. Customer SSNs: block. General question about employment law: allow. API keys and database passwords: block. Public library documentation: allow. Precision keeps legitimate workflows intact.

**Visibility and audit.** Every blocked and warned event is logged: who, when, which tool, which rule, what action. This gives security teams a factual baseline, compliance teams an audit trail, and managers the data they need to run targeted training.

## How to Deploy Without Network Changes

Browser-native AI DLP deploys as a Chrome extension. No proxy. No TLS inspection. No network architecture changes.

Employees install the extension from the Chrome Web Store in under a minute. For managed fleets, the extension can be pre-installed via Chrome Enterprise or MDM and the extension management policy can be locked so it cannot be disabled.

Policy is configured and published centrally through an admin console. Changes propagate to all installed extensions — no per-device configuration.

This means:
- **Deployment time:** Days, not months
- **IT involvement:** Minimal for initial rollout; zero for policy updates
- **Coverage:** Works on managed and unmanaged devices, on and off corporate networks, because the control is in the browser, not the network

## Rollout Sequence

**Week 1: Monitor only.** Deploy the extension to a pilot group (your highest-risk team — developers or finance) in log-only mode. No blocking, no warnings. Collect one week of baseline data on what is actually being sent to AI tools.

**Week 2: Enable warnings.** Switch to warn mode for your highest-risk data categories. Employees see a notification that their prompt contains sensitive content and can choose to proceed or cancel. This builds awareness before enforcement.

**Week 3: Enable blocking for regulated data.** Hard block for categories that create clear regulatory liability: customer PII, payment card data, patient health information, API keys and credentials. No exceptions, no proceed option for these categories.

**Week 4: Review and adjust.** Check the audit log. Look for false positives (legitimate content flagged incorrectly) and adjust rules. Look for high-volume violation teams and schedule targeted training.

**Month 2+:** Expand coverage to additional teams and data categories based on audit data.

## Communicating the Policy to Employees

The framing matters. Security controls that feel punitive generate workarounds. Security controls that feel protective generate compliance.

Recommended framing: "We are adding a guardrail that catches accidental data exposure before it happens — not monitoring your work. The extension blocks sensitive data from reaching AI tools automatically. You will see a notification if it catches something. You can continue working; we just want the sensitive data out of the prompt."

Key points to communicate:
- What the extension does (intercepts prompts, blocks specific data categories)
- What it does not do (it does not log or transmit your full prompt content)
- What employees should do if blocked (remove the sensitive content and resubmit, or contact security if they believe the block is incorrect)
- What happens to blocked events (they are logged for compliance, not reviewed individually unless there is an incident)

---

Pretzel is built for this rollout model — monitor first, warn second, block third, with centralized policy management and a full audit trail. [Start free](/download) with up to 3 users, or [see how the console works](/product).`,
  },
  {
    slug: 'ai-prompt-security',
    title: 'AI Prompt Security: How to Keep Sensitive Data Out of AI Chat Interfaces',
    description: 'AI prompt security is the practice of preventing sensitive organizational data from being submitted to AI tools. This guide covers the threat model, detection approaches, and how to build a prompt security program.',
    date: '2026-07-01',
    tag: 'Guide',
    content: `AI prompt security is the practice of controlling what data enters AI tools at the point of input — the text box — before it reaches the AI provider's servers. It is a distinct discipline from AI output safety (preventing AI from generating harmful content) and from AI model security (protecting the model itself from adversarial inputs).

This guide covers the threat model, the technical approaches, and how to build a prompt security program for your organization.

## What is AI Prompt Security?

AI prompt security refers to the controls organizations put in place to prevent sensitive data from being submitted to AI tools in employee prompts. When an employee types or pastes content into ChatGPT, Claude, or Gemini, that content is transmitted to the AI provider's servers, potentially used for training, logged in conversation history, and accessible to the AI provider under their terms of service.

Prompt security addresses the risk that employees inadvertently — or carelessly — include sensitive organizational data in these submissions: customer names and contact details, source code and credentials, patient health information, financial records, legal case details, and proprietary business information.

The goal of prompt security is not to prevent employees from using AI tools. It is to prevent data that creates regulatory, legal, or competitive liability from leaving the organization through the AI channel.

## The Prompt Security Threat Model

Prompt security threats are different from traditional data exfiltration threats in two important ways.

**Intent is usually benign.** Most data leakage through AI tools is accidental. An employee pasting a customer's support ticket to help draft a response is not trying to steal data — they are doing their job. Controls need to address accidental leakage, not just malicious actors.

**The channel is trusted by default.** Employees use ChatGPT from the same browser they use for everything else. It looks like a normal website. There is no friction signal that causes employees to think "this is different from sending an email." Training alone is insufficient; friction needs to be built into the workflow at the moment of input.

**Traditional security tools are blind to this channel.** Email DLP, endpoint DLP for files, and CASB tools all operate on different data flows. A prompt typed into a browser text box and submitted over HTTPS is invisible to all of them unless you have TLS inspection in place — and TLS inspection carries its own limitations and overhead.

## What Data Is at Risk

The categories of sensitive data most commonly found in AI prompts, in order of frequency:

**Personally identifiable information (PII).** Names, email addresses, phone numbers, dates of birth, national identification numbers, and home addresses appear in prompts when employees work with customer or employee records. Under GDPR and CCPA, submitting PII to a third-party AI service without a lawful basis and appropriate data processing agreement creates regulatory exposure.

**Credentials and secrets.** API keys, authentication tokens, database passwords, and private keys appear in developer prompts when copying configuration snippets, .env files, or code context into AI coding assistants. These are the highest-severity leakage events: a leaked API key can result in unauthorized access to production systems.

**Protected health information (PHI).** Clinical teams paste patient records, diagnoses, and treatment information into AI for summarization and drafting. HIPAA prohibits sharing PHI with unauthorized third parties, and most public AI tools do not have signed Business Associate Agreements.

**Payment card data.** Finance teams paste transaction records, account statements, and payment details into AI for analysis. Card numbers are PCI-DSS scope, and any transmission of card data to a non-compliant third party creates audit exposure.

**Legal and privileged information.** Legal teams paste client communications, contract drafts, and case materials into AI for research and drafting. Sharing privileged communications with a third party — even an AI tool — can constitute waiver of attorney-client privilege in some jurisdictions.

**Proprietary business information.** Source code implementing novel algorithms, internal pricing models, M&A strategies, and unreleased product information. Not regulated, but a genuine competitive risk if submitted to a public AI tool.

## Technical Approaches to Prompt Security

### Browser-native interception

A browser extension sits between the user and the AI tool's send button. When the user submits a prompt, the extension intercepts the content before it is transmitted, evaluates it against a policy, and either blocks the submission, shows a warning, or logs the event.

This is the only approach that operates at the actual point of input — before encryption, before transmission, with full access to the prompt text as typed. It requires no network infrastructure changes and works on any device with the extension installed.

Detection methods available at the browser layer:
- **Pattern matching:** Regular expressions for known sensitive formats — SSN patterns, card number patterns, email formats
- **Entropy detection:** Statistical analysis to identify API keys, tokens, and passwords by their randomness — catches credentials not in any keyword list
- **Keyword and dictionary matching:** Custom blocklists of client names, internal terms, and regulated identifiers
- **Score-based rules:** Combining multiple signals to flag prompts that are borderline on any single dimension

### Policy-based governance

Prompt security is most effective when it is policy-driven rather than rule-driven. A policy defines: which data categories are prohibited, for which teams, on which tools, and what action to take when detected.

A well-structured policy has different rules for different organizational divisions. The engineering team needs entropy detection for credentials. The healthcare team needs PHI identifier blocking. The finance team needs card number patterns. A single global policy that tries to cover all cases creates too many false positives to be usable.

### Audit and visibility

Prompt security controls without audit visibility are partial solutions. The audit log — which rule triggered, which team, which AI tool, what action was taken — provides three things: a compliance evidence trail, a baseline for policy calibration, and the data for targeted employee training.

## Building a Prompt Security Program

**Start with a data inventory.** What sensitive data do your highest-risk teams work with? Match data categories to regulatory requirements: PHI under HIPAA, card data under PCI-DSS, PII under GDPR/CCPA, privileged communications for legal. This is your block list.

**Deploy in monitor mode first.** Before enabling blocking, run in log-only mode for two weeks. The audit data will show you what is actually being submitted — often different from what you assumed. Use this to calibrate your rules before enforcement.

**Enable blocking for highest-severity categories.** API keys and credentials, regulated PII, payment card data. These have clear regulatory consequences and low false-positive rates when detection is well-tuned.

**Use warn for borderline categories.** Internal project names, vendor pricing, proprietary business logic. Show employees a warning, let them decide, but log the decision. This creates awareness without blocking legitimate workflows.

**Review the audit log monthly.** Prompt security is not a set-and-forget control. New AI tools emerge, employee workflows evolve, and new data categories become sensitive as business circumstances change. Monthly review keeps the program calibrated.

---

Pretzel implements this model: browser-native detection, centralized policy management, team-scoped rules, and a full audit trail. [Read how it works](/product) or [start free](/download) — up to 3 users, no credit card required.`,
  },
  {
    slug: 'ciso-guide-generative-ai',
    title: "The CISO's Guide to Generative AI Risk: What to Govern, What to Block, and What to Allow",
    description: 'A practical framework for CISOs building an enterprise generative AI governance program. Covers what data to block, which use cases to allow, and how to enforce policy without killing productivity.',
    date: '2026-07-04',
    tag: 'CISO',
    content: `Generative AI tools arrived in the enterprise faster than any technology in recent memory. ChatGPT reached 100 million users in two months. By the time most security programs had a policy drafted, half the organization was already using it daily.

This guide is for CISOs who have moved past "should we allow AI tools?" and are now building a real governance program. It covers what to govern, what to block, what to allow, and how to enforce it without killing the productivity gains your business has already come to depend on.

## The Governance Gap

Traditional enterprise security was designed around perimeters and file flows. Your DLP blocks email attachments containing SSNs. Your CASB monitors uploads to Dropbox. Your endpoint solution detects malware on the device.

None of these tools were designed to intercept a 200-word paragraph typed into a browser text box and submitted to a third-party AI over standard HTTPS.

> ChatGPT is the highest-volume AI surface and the one most organizations encounter first. For a full breakdown of why it is uniquely difficult to protect against with traditional tools, see our [ChatGPT Data Loss Prevention guide](/blog/chatgpt-data-loss-prevention).

The governance gap is architectural, not procedural. You cannot solve it with a policy memo. You need controls that operate where the data actually moves — inside the browser, at the moment of input.

## What to Govern

Not every AI use case carries the same risk. Before building a blocklist, map the landscape:

**High-risk use cases** (data that creates regulatory or legal exposure):
- Patient records, PHI, and clinical notes sent to AI for summarization or drafting
- Customer PII sent to AI for email drafting, CRM data analysis, or support work
- Financial account data, card numbers, and transaction records
- Source code containing credentials, API keys, or proprietary algorithms
- Legal case details, client names, and privileged communications
- Internal deal codenames, M&A targets, and unreleased product information

**Medium-risk use cases** (no direct regulatory exposure, but IP or competitive sensitivity):
- Internal strategy documents and roadmap discussions
- Organizational structure, headcount, and compensation discussions
- Vendor pricing and contract terms

**Low-risk use cases** (appropriate for broad AI tool access):
- Drafting external communications using publicly available information
- Research on publicly known topics
- Coding help using open-source libraries and public APIs
- Learning, summarization of published materials, language tasks

The governance program should start with hard controls on high-risk use cases and lighter-touch awareness for medium-risk ones. Low-risk use cases should be actively encouraged — this is where the productivity value lives.

## What to Block

Block means the prompt never reaches the AI provider's servers. Use block for data where exposure creates:

- **Regulatory liability** — HIPAA PHI, PCI-DSS card data, GDPR-covered personal data, FERPA student records
- **Legal privilege risk** — attorney-client communications, work product, client matter details
- **Material financial risk** — MNPI, unreported earnings data, M&A details before announcement
- **Credential exposure** — API keys, service account passwords, database connection strings, tokens

These categories are not negotiable. The regulatory consequences of exposure are concrete. Use pattern detection for known formats (SSNs, card numbers, IBANs) and entropy detection for credentials and API keys — high-entropy strings that your keyword list does not know to look for.

## What to Warn (But Not Block)

Some data is sensitive but not regulated. For these categories, a warn action — showing employees what was detected and asking for justification — is more appropriate than a hard block. Warn actions:

- Build employee awareness without creating friction for legitimate workflows
- Create an audit trail of borderline decisions without stopping work
- Surface edge cases that help you refine your policy over time

Apply warn to: internal project names and codenames, vendor pricing, proprietary but non-regulated business logic, and organizational data that is sensitive but not illegal to share.

## What to Allow

This is the part most security programs get wrong. Over-restriction is not a security win — it is a productivity loss that creates shadow IT. Employees who cannot use approved AI tools find unapproved ones.

Define a clear allowlist of approved AI platforms (ChatGPT, Claude, Gemini are the highest-volume enterprise tools) and communicate that using them for low-risk tasks is not just permitted but encouraged. Your AI governance program should make employees feel supported, not surveilled.

## The Enforcement Stack

An effective AI governance program has three layers:

**Layer 1: Technical controls.** Browser-native AI DLP that intercepts prompts before submission. This is the only layer that works without network infrastructure changes. It handles the high-risk cases automatically, before human judgment is required.

**Layer 2: Audit and visibility.** Even with blocking in place, you need a log of what is being caught, which teams are triggering violations, and whether your policy is calibrated correctly. Audit logs also provide the evidence trail that regulators, auditors, and cyber insurance underwriters increasingly require.

**Layer 3: Awareness and training.** Technical controls stop the automated leakage. Training handles the edge cases: employees who find ways around controls, novel use cases your policy did not anticipate, and the cultural shift toward treating AI tools as a shared resource with shared responsibility.

## Building the Program

**Month 1:** Deploy AI DLP in monitor-only mode. No blocking. Collect baseline data on what is actually being sent to AI tools across your organization. This data will be more useful than any threat model you build from assumptions.

**Month 2:** Enable blocking for the highest-risk categories: credentials, regulated PII, card data. Enable warn for the medium-risk categories. Communicate the policy to employees — explain why, not just what.

**Month 3:** Review the audit data. Adjust false positive rates. Identify teams with high violation rates that need targeted training. Add rule coverage for patterns you missed in month 1.

**Quarter 2+:** Expand coverage to additional AI platforms as your employees adopt them. Build quarterly policy reviews into your security calendar. Use the audit log to report to your board on AI risk posture.

---

Pretzel is built for this governance model: browser-native detection, centralized policy management, team-scoped rules, and a full audit trail. [See how it works](/product) or [start free](/download) with no network changes required.`,
  },
  {
    slug: 'chatgpt-data-loss-prevention',
    title: 'ChatGPT Data Loss Prevention: How to Stop Sensitive Data from Reaching OpenAI',
    description: 'ChatGPT is the highest-volume AI data leakage surface in most organizations. This guide covers what data is at risk, why network DLP misses it, and how to configure effective ChatGPT DLP.',
    date: '2026-07-03',
    tag: 'Guide',
    content: `ChatGPT is the AI tool your employees use most. It is also the highest-volume data leakage surface in most organizations. This guide covers what is actually being sent, why your existing security tools do not catch it, and how to configure effective ChatGPT data loss prevention.

## Why ChatGPT Is the Highest-Risk AI Surface

ChatGPT's web interface at chat.openai.com is the entry point for the majority of enterprise AI usage. Unlike API-based AI integrations — which go through controlled, inspectable channels — the ChatGPT web interface is accessed directly from employees' browsers over standard HTTPS. It looks like any other website.

This is the core problem: **your existing DLP tools were not designed to monitor browser text input submitted over HTTPS**.

Email DLP catches attachments. CASB catches file uploads. Endpoint DLP monitors USB drives and print jobs. None of them intercept a 300-word paragraph typed into a browser text box.

## What Data Is Leaking Through ChatGPT

Based on data from the Pretzel platform, the most common sensitive content categories found in AI prompts from business users include:

**Customer PII.** Support teams paste customer names, email addresses, phone numbers, and account details into ChatGPT to draft responses or summarize cases. Under GDPR and CCPA, this is a third-party data share — potentially without a valid legal basis.

**Source code and credentials.** Developer teams use ChatGPT as a coding assistant. They paste entire functions, configuration files, and .env snippets to get help with bugs. API keys, database passwords, and service account tokens travel with the code context.

**Financial data.** Finance teams use ChatGPT to draft reports, analyze transactions, and summarize data. Credit card numbers, bank account details, and internal financial figures appear in these prompts.

**Legal documents.** Legal teams use ChatGPT to summarize contracts, draft clauses, and research case law. Client names, matter details, and privileged communications appear in prompts when employees include document excerpts for context.

**Internal strategy.** Business development, product, and executive teams use ChatGPT to draft presentations and strategy documents. Unreleased product names, acquisition targets, and competitive intelligence appear in these prompts.

## Why Network DLP Does Not Catch ChatGPT Prompts

The most common response from security teams when this is raised: "We have DLP. It monitors outbound traffic."

The issue is architectural. Network DLP inspects traffic at the perimeter — between the corporate network and the internet. To inspect HTTPS traffic, network DLP must perform TLS inspection: decrypting the traffic at a proxy, inspecting it, then re-encrypting it before forwarding to the destination.

TLS inspection has three problems in the context of ChatGPT:

1. **Modern TLS 1.3 with certificate pinning.** Some clients and applications verify the server certificate chain directly and will reject a proxy's certificate. This breaks the inspection and may break the application.
2. **Operational complexity.** Deploying, maintaining, and scaling TLS inspection infrastructure is a significant IT undertaking. Many organizations have it in limited deployment or not at all.
3. **Endpoint-only users.** Remote workers and employees on personal networks bypass your corporate proxy entirely. Network DLP sees nothing from these users.

Even organizations with TLS inspection in place often exclude ChatGPT because it is categorized as a productivity tool rather than a data risk.

## How Browser-Native ChatGPT DLP Works

Browser-native DLP solves the architectural problem directly. A browser extension sits between the user's keystrokes and ChatGPT's send button.

When a user types or pastes content into ChatGPT and clicks submit, the extension intercepts the prompt text before it is submitted. It runs the text through your policy engine — checking for PII patterns, credential formats, high-entropy strings, and keyword blocklists. If a violation is detected, the submission is blocked and the user sees exactly what was caught.

The entire process is local. The full prompt text never leaves the browser. No proxy. No network infrastructure. No SSL inspection.

## Configuring ChatGPT DLP with Pretzel

Pretzel's browser extension intercepts ChatGPT prompts at the point of submission and enforces your organization's policy before the send button works.

**Detection types available for ChatGPT:**

| Detection type | What it catches |
|---|---|
| Pattern matching | SSNs, credit card numbers, IBANs, email addresses, phone numbers |
| Entropy detection | API keys, tokens, passwords — even unknown credential formats |
| Keyword/dictionary | Custom blocklists: client names, project codenames, internal identifiers |
| Score-based rules | Combinations of signals that together indicate high sensitivity |

**Actions:**
- **Block** — the prompt is not submitted. The user sees what was caught.
- **Warn** — the user is shown a warning and can choose to proceed or cancel.
- **Log only** — the event is recorded but the prompt is submitted. Use this for monitoring before enforcing.

**Team scoping.** Different teams carry different risk profiles. Engineering teams need entropy detection for credentials. Finance teams need card number and IBAN patterns. Legal teams need client name keyword blocks. Pretzel Console lets you apply different rules to different organizational divisions.

**Audit trail.** Every blocked or warned event is logged: timestamp, user, what rule triggered, what action was taken. This is the compliance evidence your auditors will ask for.

## Deployment

Pretzel deploys as a Chrome extension — no network changes, no proxy configuration, no IT infrastructure work. Employees install it from the Chrome Web Store. Administrators publish policies from the Pretzel Console, which propagates to all installed extensions.

For enterprise deployments, the extension can be pre-installed via MDM (managed Chrome Browser or ChromeOS) and the policy can be locked so employees cannot disable it.

[Start free](/download) — up to 3 users at no cost. [See full pricing](/pricing) for team and enterprise plans.`,
  },
  {
    slug: 'ai-acceptable-use-policy-template',
    title: 'AI Acceptable Use Policy Template for Enterprise Teams',
    description: 'A ready-to-use AI acceptable use policy template covering approved tools, prohibited data types, enforcement, and employee responsibilities. Copy, customize, and deploy.',
    date: '2026-07-02',
    tag: 'Template',
    content: `Most organizations have a ChatGPT problem before they have a ChatGPT policy. This template gives you a starting point that you can adapt to your organization in under an hour.

This is a working policy document — not a framework or a checklist. Copy the template below, replace the bracketed placeholders, and run it through your legal and security review before publishing internally.

---

## AI Acceptable Use Policy Template

**Policy name:** Generative AI Acceptable Use Policy
**Version:** 1.0
**Owner:** [CISO / Head of Information Security]
**Effective date:** [DATE]
**Review cycle:** Annual, or upon material change to approved tools or regulatory requirements

---

### 1. Purpose

This policy establishes the rules for employee use of generative artificial intelligence (AI) tools, including large language model (LLM) chat interfaces, AI coding assistants, and AI-powered productivity applications. It defines which tools are approved for use, what data may and may not be submitted to these tools, and the controls that enforce these rules.

The purpose of this policy is to enable employees to benefit from AI-powered productivity tools while protecting [ORGANIZATION NAME], its customers, and its partners from data leakage, regulatory violation, and intellectual property exposure.

---

### 2. Scope

This policy applies to all employees, contractors, and third parties who access [ORGANIZATION NAME] systems, data, or networks. It applies to use of AI tools on all devices — corporate-managed and personal — when used for work purposes.

---

### 3. Approved AI Tools

Employees may use the following AI tools for work purposes:

| Tool | Approved use | Restrictions |
|---|---|---|
| ChatGPT (chat.openai.com) | Drafting, research, coding assistance | Subject to data restrictions in Section 4 |
| Claude (claude.ai) | Drafting, analysis, summarization | Subject to data restrictions in Section 4 |
| Gemini (gemini.google.com) | Drafting, research | Subject to data restrictions in Section 4 |
| [ADDITIONAL TOOLS] | [USE CASE] | [RESTRICTIONS] |

Use of AI tools not listed above requires prior approval from [CISO / IT Security]. Employees must not route organizational data through unapproved AI tools or services.

---

### 4. Prohibited Data

The following data categories must never be submitted to any AI tool, including approved tools:

**Category A — Always prohibited (block):**
- Personal data as defined under applicable privacy law, including names, email addresses, phone numbers, national identification numbers, dates of birth, and financial account details of customers, employees, or any identifiable individual
- Payment card numbers, bank account numbers, and financial credentials
- Passwords, API keys, authentication tokens, private cryptographic keys, and database connection strings
- Protected health information (PHI) as defined under HIPAA, including patient names, medical record numbers, diagnoses, and treatment information
- Attorney-client privileged communications and attorney work product
- Material non-public information (MNPI) about [ORGANIZATION NAME] or any publicly traded entity
- Information subject to a signed non-disclosure agreement where disclosure to a third party is prohibited

**Category B — Use caution, justification required (warn):**
- Internal project names, codenames, and unreleased product information
- Vendor pricing, contract terms, and negotiation details
- Organizational headcount, compensation, and performance information
- Information about pending business transactions or partnerships

---

### 5. Employee Responsibilities

Employees who use AI tools for work purposes are responsible for:

1. Reading and understanding this policy before submitting any work-related content to an AI tool.
2. Reviewing every prompt before submission to ensure it does not contain data from Category A.
3. Exercising judgment on Category B data and obtaining supervisor approval where required.
4. Reporting any accidental submission of prohibited data to [security@yourcompany.com] within [24 hours] of discovery.
5. Not attempting to circumvent the technical controls enforcing this policy.

---

### 6. Technical Enforcement

[ORGANIZATION NAME] enforces this policy through browser-based DLP controls deployed via the Pretzel browser extension. The extension intercepts AI prompts before submission and enforces the prohibitions in Section 4 automatically.

Employees will see a notification if a prompt is blocked or flagged. Blocked prompts are not submitted to the AI tool. All enforcement events are logged for compliance and audit purposes.

Attempting to circumvent these controls constitutes a violation of this policy.

---

### 7. Audit and Monitoring

[ORGANIZATION NAME] logs all AI tool enforcement events, including blocked prompts and warned submissions. Logs include: timestamp, user identifier, tool accessed, rule triggered, and action taken. Logs do not include the full content of blocked prompts.

Logs are retained for [12 months / as required by applicable law or your audit retention schedule] and may be reviewed by the Information Security team, Internal Audit, and Legal as required.

---

### 8. Violations

Violations of this policy — including intentional submission of prohibited data or circumvention of technical controls — may result in disciplinary action up to and including termination of employment or contract, and may be referred to relevant regulatory authorities where required by law.

---

### 9. Exceptions

Employees who require an exception to this policy for a specific, time-limited business purpose must submit a written request to [CISO / IT Security] with: the specific data category, the proposed AI tool, the business justification, and the duration required. Exceptions require written approval and are logged.

---

### 10. Review and Updates

This policy is reviewed annually or upon material change to: approved AI tools, technical enforcement capabilities, or applicable regulatory requirements. The current version is maintained at [INTERNAL POLICY URL].

---

## How to Customize This Template

**Replace all bracketed placeholders** — dates, names, email addresses, and internal URLs — before publishing.

**Section 3 (Approved Tools):** Add any internal AI tools your organization has built or licensed. Remove tools you have not evaluated and approved.

**Section 4 (Prohibited Data):** Tailor Category A to your regulatory environment. Healthcare organizations should explicitly enumerate the 18 HIPAA PHI identifiers. Financial services organizations should add PCI-DSS card data and MNPI. Legal teams should add matter numbers and client names. Category B is where your organization's specific sensitivities go — internal codenames, deal names, and competitive information.

**Section 6 (Technical Enforcement):** If you are not yet using a technical enforcement tool, update this section to reflect your current approach (for example: "enforced by employee attestation and periodic audit" — be honest about your maturity level). The gap between policy and enforcement is where incidents happen.

**Section 8 (Violations):** Review this section with your employment counsel before publishing. The consequences must be consistent with your existing HR policies and employment contracts.

---

## Deploying the Policy

Once finalized:

1. Publish to your internal policy repository and update the URL in Section 10.
2. Communicate to all employees with a read-receipt or attestation requirement.
3. Configure your technical enforcement tool to match the data categories in Section 4.
4. Brief managers on the policy before launch — they will get the first questions.
5. Schedule a 90-day review to assess whether enforcement data reveals gaps in the policy.

Pretzel Console lets you import the data categories from this policy as detection rules directly. [Start free](/download) and configure your policy in the console before rolling out to your team.

---

## Get the Policy Kit (Policy + Implementation Checklist)

The template above covers the policy document. The full **AI Policy Kit** includes:

- This AUP template (pre-filled for healthcare, legal, fintech, and engineering)
- A 10-point implementation checklist for rolling the policy out company-wide
- A one-page employee summary you can use for the announcement email
- A 90-day post-launch review scorecard

The kit is included in your Pretzel account. [Create a free account](/download) — no credit card, no sales call — and access it from the Resources tab in your console.

> Already have a Pretzel account? Log in to your console and go to **Resources → Policy Templates**.`,
  },
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

Start free at mykka.ai — the Healthcare template is included on all plans.`,
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
