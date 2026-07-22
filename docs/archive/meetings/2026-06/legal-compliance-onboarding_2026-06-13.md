# mykka.ai — Legal, Financial & Security Compliance Kickoff
**Date:** June 13, 2026
**Chair:** Ethan Cole (CEO)
**Attendees:** Yael Mizrahi (Israeli & International Tech Lawyer), Avi Shapiro (Israeli CPA), Noa Katz (CISO), Tal Ben-David (Cybersecurity Specialist)
**Purpose:** Brief new team on production readiness status + roadmap. Get their assessment of what is needed to go to production legally, financially, and securely. Resolve the Israeli entity question.

---

## Part 1 — Ethan: Context Dump

**ETHAN:** Welcome to everyone — Yael, Avi, Noa, Tal. You're all new here, so let me give you the state of play in two minutes before I ask each of you to tell me what I need to hear.

### What mykka.ai is

We build a Chrome extension called Pretzel. It intercepts employee prompts before they're sent to AI tools — ChatGPT, Claude.ai, Gemini — and blocks or warns based on data loss prevention policies configured by IT admins. The admin console is called Pretzel Console. We have a backend API, a marketing website at mykka.ai, and a billing system on Stripe. All of it is B2B SaaS — we sell to companies, not individuals.

### What happened at the last production readiness meeting (June 11)

We reviewed whether we can deploy to production. The verdict:

- **Code:** Ready. The full E2E test suite passes. Backend, console, extension — all launchable from a code standpoint.
- **Infrastructure:** Decided and costed. Render Standard backend ($25/month, always-on), Neon free-tier Postgres, Vercel free for the marketing site, Render free static for the console. Total fixed cost: **$25/month at launch**.
- **DNS:** GoDaddy nameservers → Cloudflare → routes all subdomains (api.mykka.ai, console.mykka.ai, mykka.ai). Ryan Kowalski (DevOps) owns setup.
- **Payments:** Stripe goes live on launch day. PayPal verification takes 24–48h; we launch Stripe-only and add PayPal after.
- **Extension:** We can submit to the Chrome Web Store tomorrow. Google review takes 1–5 business days. Launch sequence: web stack live first, extension submitted same day, marketing push when Chrome approves.
- **Service credentials needed before launch:** Stripe live keys + product IDs, Clerk live keys (branding), Mailgun SMTP, Anthropic API key, Sentry DSNs. One day of configuration work.
- **Key constraints noted:** No uptime SLA we can promise enterprises (Render Standard is not enterprise-grade), no EU data residency (US East only). Both are post-launch issues.
- **Action items assigned:** Ryan executes launch checklist, Marcus signs off on deploy, Priya holds marketing push.

### The roadmap in brief

**Phase 1 — Active (Jun–Aug 2026): Ship the Core Product**
- Pretzel Chrome Extension (live on Web Store)
- Pretzel Console (admin dashboard — policies, members, violations, billing)
- Backend API (policy engine, tenant isolation, Stripe, Clerk auth)
- mykka.ai marketing site
- Analytics pipeline feeding a live violation dashboard
- HIPAA / SOC 2 / PCI compliance detection rules (in parallel, not a launch blocker)

**Phase 2 — Planned (Sep 2026–Jan 2027): mykka-guard — Beyond the Browser**
- mykka-guard: local HTTPS proxy intercepting all AI API traffic (Cursor, Claude Code, scripts, any non-browser tool)
- @mykka/detect: open-source npm detection library extracted from the extension
- Coverage Map in Console: per-member view of which clients are installed
- API Key Management: non-browser clients authenticate with long-lived keys
- This phase targets developers and technical teams who bypass the browser

**Phase 3 — Future (2027+): Platform Expansion**
- mykka git hook (pre-commit scan)
- mykka GitHub Action (PR pipeline scan)
- mykka Jupyter Extension (data science enforcement)
- mykka LSP (Language Server for any IDE)
- mykka Slack/Teams App (audit Slack AI and Microsoft Copilot)
- mykka Solo ($10/month PLG product for individual developers)

### The thing nobody solved

We have a product. We have working code. We have paying customer infrastructure ready to go live. **We have no Israeli legal entity.** No חברה בע"מ, no עוסק מורשה, nothing registered. No Israeli bank account. No Privacy Policy or Terms of Service on the website. No data processing agreements. No formal security posture documentation.

That's why you four are here. I need to know: what do I need from each of you before I can legally and lawfully flip the switch to production — and what's the right answer on the entity question?

Yael, start.

---

## Part 2 — Yael Mizrahi: Israeli Law Assessment

**YAEL:** Thank you, Ethan. I'll be direct.

The technical product is ready. The legal infrastructure to operate it as a business is not. Here's everything that needs to exist before you charge a single customer, whether Israeli or foreign.

### The entity question — my answer

Neither option is equivalent, and this is the most consequential decision you'll make today.

**עוסק מורשה (Licensed Dealer / Sole Proprietor):**
You can open it this afternoon via the Israel Tax Authority website. No registration fee, no waiting period. But: it is you personally. There is no corporate veil. If a customer sues mykka.ai, they are suing you personally. You cannot have co-founders with separate ownership stakes in any structured way. You cannot issue employee stock options (Section 102 requires a company). You cannot raise investment — no SAFE, no equity round, because there is no equity to issue. Enterprise customers, particularly those with legal departments, will frequently refuse to contract with a sole proprietor. And crucially, the Israeli Innovation Authority does not grant R&D funding to a sole proprietor.

**חברה בע"מ (Private Limited Company):**
Separate legal entity. Limited liability. Can have multiple shareholders. Can raise investment. Can issue Section 102 employee options. Eligible for IIA R&D grants. Eligible for Preferred Technology Enterprise tax status (7.5% or 0% effective tax on IP income). Enterprise customers can contract with it without hesitation.

**My recommendation: חברה בע"מ. Do not register as עוסק מורשה.** The moment you accept your first customer payment you have revenue. The moment a customer's data is involved you have liability exposure. You need the corporate veil now, not after you've scaled.

**How fast can it be done?** Via the Registrar of Companies (רשם החברות) online portal: 3–5 business days, registration fee ₪2,600. Faster option: a law firm can incorporate a pre-registered shelf company (חברת מדף) in the same business day for roughly ₪1,000–₪2,500 in fees. I can arrange this. The Articles of Association (תקנון) need to be drafted and filed. I'll prepare them.

### Israeli bank account — this is the real bottleneck

Registering the company takes days. Opening the business bank account takes **2–4 weeks** at most Israeli banks. Bank Hapoalim, Bank Leumi, Discount — all of them have onerous KYC procedures for new companies. This is the actual blocker on receiving customer payments into an Israeli entity. We need to start this process **today**, before anything else.

Alternative: open a Stripe account registered to the foreign entity first, and redirect to the Israeli entity later once the bank account is live. Avi can advise on the tax implications of that.

### Privacy Policy and Terms of Service

You need both before a single user signs up. Not optional. Under both Israeli law and GDPR, you must disclose: what personal data you collect, how it is processed, where it is stored (US East — you must say this), the legal basis for processing, and the user's rights. The current website has neither. This is a week of drafting work. I start immediately.

### PPA Database Registration

Under the Israeli Privacy Protection Law 5741-1981 and the Privacy Protection Regulations 5778-2017, any entity that maintains a database of personal information about more than 10 Israeli individuals is required to register that database with the Privacy Protection Authority (רשות להגנת הפרטיות — previously מינהל הגנת הפרטיות). Your database contains user account data — names, email addresses, organization information, and potentially prompt content that may include personal data. This is a **legal obligation**, not optional.

The registration determines the security level (Standard, Medium, or High) and the controls required. Noa and Tal will classify the correct level. I file the registration paperwork once the entity exists.

### Employment / Contractor agreements

Any developers or staff working for mykka.ai in Israel need either an Israeli employment contract or a contractor agreement that complies with Israeli labor law. If someone works more than 4 months continuously, Israeli courts will often reclassify them as an employee regardless of the contract. That means severance obligations, social security, and overtime exposure. Get proper contracts in place before the first paycheck.

### Cross-border data transfers

Your data lives on US servers (Render US East). If you have EU users — and you will — you need Standard Contractual Clauses in your privacy policy and Data Processing Agreements with your processors (Render, Clerk, Stripe). Israel has EU adequacy status for data transfers, meaning Israel → EU is permissible. But mykka.ai → US servers → EU users needs SCCs documented. I'll draft the DPA template.

### My pre-production checklist

| Item | Owner | Timeline |
|---|---|---|
| Register חברה בע"מ (shelf company route) | Yael + Ethan | 1 business day |
| Open Israeli business bank account | Ethan + Avi | Start today — 2–4 weeks |
| Articles of Association + shareholder agreement | Yael | 3 days |
| Privacy Policy + Terms of Service | Yael | 1 week |
| PPA database registration (after entity exists) | Yael | 1–2 weeks |
| Israeli employment / contractor agreements | Yael | 1 week |
| DPA template for enterprise customers | Yael + David Horowitz | 1 week |
| Cross-border transfer documentation (SCCs) | Yael | 1 week |

**Bottom line: you can go to production with foreign users immediately if you have a Privacy Policy and ToS live. For Israeli users and Israeli revenue, you need the entity registered first. The bank account is the long pole.**

---

## Part 3 — Avi Shapiro: Financial & Tax Assessment

**AVI:** I agree with everything Yael said on the entity question. Let me give you the financial dimension of that decision, and then I'll tell you what else needs to happen.

### עוסק מורשה vs. חברה — the tax math

As an עוסק מורשה in Israel, your business income is taxed as personal income. Progressive rates: 10% on the first ₪77K, up to **50% on income above ₪698K**. With no corporate structure, there is also no way to apply for Preferred Technology Enterprise status, which can drop your effective tax rate on IP income to **7.5% or even 0%** in development towns.

As a חברה בע"מ, the standard corporate tax rate is **23%**. Once you qualify for Preferred Technology Enterprise (a tech company selling to non-Israeli customers with significant R&D spend), that drops to **7.5%**. For a company like mykka.ai that earns substantially from international SaaS revenue derived from IP, this is not a marginal difference — it is the difference between retaining 77% of profit and retaining 50%.

Do not run a SaaS business that will earn real money through an עוסק מורשה. It does not make financial sense.

### VAT registration — mandatory, and not simple

Once the company is registered, you need to register for VAT (מע"מ). This is mandatory before receiving payment from any Israeli customer. However, note this carefully: **SaaS services sold to customers outside Israel are zero-rated for VAT (0%)**. This is excellent news — you do not charge VAT on your international revenue. But you must still be registered to claim **input VAT refunds** on your Israeli business expenses (lawyers, accountants, software, office). If you are not registered, you pay VAT on all your costs and cannot reclaim it. That is money left on the table from day one.

VAT registration timeline: 2–3 business days online via the Tax Authority portal (once the entity exists).

### Stripe, PayPal, and the revenue question

You are about to receive customer payments via Stripe into — what entity exactly? If it's a personal account registered to you as an individual, all that revenue flows to you personally. It's personal income, taxed at up to 50%. And at the point when you register the company and try to transfer that revenue in, you have a deemed distribution event with additional tax implications.

**Recommendation:** Do not go live with Stripe until you have at least an entity registered and a mechanism to receive payments in its name. This does not require the Israeli bank account first — Stripe and PayPal both support non-Israeli entity registration (a US Delaware LLC or equivalent). Ethan, do you have a US entity?

If you have a US entity, you can register Stripe under that, collect revenue there, and sort the Israeli entity in parallel. The intercompany arrangement between the US and Israeli entities is a transfer pricing matter I'll handle. If you have no US entity and no Israeli entity, you are personally receiving payments, and that is a problem.

### IIA R&D grants — significant opportunity

The Israel Innovation Authority offers grants covering **20–30% of approved R&D expenditure** for qualifying Israeli tech companies. For a company spending, say, ₪500K/year on engineering salaries in Israel, that is a ₪100–₪150K non-dilutive grant. The application is competitive but mykka.ai's profile is strong — proprietary detection technology, IP developed in Israel, B2B software. However: **you must be a registered Israeli company (חברה בע"מ) to apply**. Every month you delay registration is a month of potentially grantable R&D spend that passes unrecovered.

The IP transfer restriction is also worth understanding now: if IIA funds the development of your detection IP, you cannot transfer that IP outside Israel without IIA approval and royalty repayment obligations. This matters if you ever consider an acquisition or restructuring. We set the structure correctly from the start to avoid future constraints.

### Section 102 options

If you plan to grant equity or options to employees or contractors in Israel, Section 102 of the Israeli Income Tax Ordinance allows employees to pay capital gains tax (25%) instead of income tax (up to 50%) on option profits — but only if the company is registered, the option plan is approved, a licensed trustee holds the options, and a 24-month holding period is respected. None of this is possible without a חברה בע"מ. If you grant options before the plan is set up correctly, the employees pay income tax. Set the plan up from day one.

### My pre-production checklist

| Item | Owner | Timeline |
|---|---|---|
| Register חברה בע"מ | Yael (I coordinate) | 1 business day via shelf |
| Open business bank account (start now) | Ethan + Avi | Start today — 2–4 weeks |
| VAT registration (מע"מ) | Avi | 2–3 days after entity |
| Stripe registration → transfer to company entity | Ethan + Avi | After entity |
| Confirm whether US entity exists → intercompany structure | Ethan to confirm | This week |
| IIA grant pre-application assessment | Avi | 2 weeks after entity |
| Section 102 option plan setup | Avi + Yael | 4 weeks after entity |
| Bituach Leumi employer registration | Avi | 1 week after entity |

**Bottom line: without an entity, you are personally liable for every tax, every payment, and every legal obligation. The bank account is the bottleneck. Start it today.**

---

## Part 4 — Noa Katz: CISO Assessment

**NOA:** From a security and compliance perspective, I'll split this into "must-have before you flip the switch" and "must-have before you sign your first enterprise deal." Different timelines, both non-negotiable.

### Must-have before production go-live

**1. Privacy Policy and Terms of Service live on the website.**
Yael is drafting these. From my side, the Privacy Policy must accurately describe the technical reality: what data is collected (user accounts, organizational data, flagged prompt content), where it is stored (Render US East), who has access, and how long it is retained. I will review the technical accuracy of both documents before they go live. If the policy says "we do not store prompt content" but the database stores violation records containing prompt excerpts, that is a compliance violation on day one.

**2. GDPR consent mechanism on the website.**
If you have EU visitors — and you will from the moment the marketing site is live — you need a cookie consent banner (GDPR Article 7) and you need to not track users without consent. The current marketing site: does it have Google Analytics or any third-party trackers? Tal will check. If yes, cookie consent is required before launch for EU visitors.

**3. Basic incident response plan documented.**
Under GDPR Article 33, you have 72 hours to notify the relevant supervisory authority after becoming aware of a personal data breach. Under Israeli law, the PPA has similar notification expectations. I will write a one-page incident response and breach notification procedure. It does not need to be elaborate at this stage — it needs to exist and someone needs to know what to do.

**4. Data retention policy.**
How long do you keep flagged prompt violations? If you keep them indefinitely, EU and Israeli law create problems. A defined retention period (e.g., 12 months rolling) documented in the privacy policy satisfies the requirement. I'll set the policy; Arjun (backend) implements the scheduled deletion.

**5. Security review of the production codebase.**
Before real customers send real data through the product, Tal will conduct a focused pre-launch security review. Not a full pen test — that takes weeks. A targeted assessment: API authentication, tenant isolation, secrets management, dependency vulnerabilities. Tal has the details in his section.

**6. DPA (Data Processing Agreement) template.**
Any enterprise customer will ask for a DPA before signing. Without one, the deal stalls in legal review. Yael and David Horowitz draft this; I review the technical security clauses (Article 32 measures). Takes one week. Should be ready before first enterprise outreach.

### Must-have before first enterprise deal (not launch blockers, but 30-60 day items)

**SOC 2 Type II — start the process now.**
Enterprise customers — especially in fintech, healthcare, and legal — will ask for SOC 2. It takes 6–12 months to achieve (3 months of audit observation period minimum after controls are implemented). Every month we delay starting the process is a month added to the timeline before we can close large enterprise deals. I will write the SOC 2 program design this month, Tal implements the technical controls, and we engage a CPA firm for the audit. Ryan Kowalski already has SOC 2 controls in his domain (AWS, CI/CD, secrets) — we formalize what he's already doing.

**ISO 27001 — assess timing after SOC 2 scope is clear.**
Israeli enterprise customers and European customers will expect ISO 27001 more than SOC 2. We assess whether to pursue it in parallel or sequentially. My view: SOC 2 first (broader US market relevance), ISO 27001 in Phase 2.

**Israeli Privacy Protection Regulations — data security level classification.**
Once the PPA database registration is filed, we need to formally classify mykka.ai's databases. My initial read: the user database (names, emails, org data) is **Standard level**. The violations database (flagged prompt content, which may include health information, financial data, credentials) is likely **Medium level** given the sensitivity of what the detection engine flags. Medium level triggers specific technical control requirements I will document. Tal implements them.

### INCD obligations — current assessment

At this stage, mykka.ai does not operate in a sector that triggers mandatory INCD directives (critical infrastructure — energy, water, financial market infrastructure, etc.). We are a B2B SaaS vendor, not a regulated operator. However: if we sell to regulated Israeli customers (banks, health insurance companies), *they* are INCD-regulated, and they will ask us detailed security questions. Our security posture needs to satisfy their compliance teams, even if we have no direct INCD obligation.

### My pre-production checklist

| Item | Owner | Timeline |
|---|---|---|
| Privacy Policy technical review | Noa (reviews Yael's draft) | 1 week |
| Cookie consent / GDPR consent on website | Tal (technical) | 1–2 days |
| Incident response + breach notification procedure | Noa | 3 days |
| Data retention policy (with backend implementation) | Noa (policy) + Arjun (code) | 1 week |
| DPA template — technical security clauses review | Noa (reviews Yael's draft) | 1 week |
| Pre-launch security review | Tal | 1 week (see Tal's section) |
| SOC 2 program design | Noa | 2–4 weeks post-launch |
| Privacy Protection Regulations security level classification | Noa + Tal | 2 weeks post-entity registration |

---

## Part 5 — Tal Ben-David: Technical Security Assessment

**TAL:** I'll keep this specific. Before you go to production, I need to run a focused pre-launch security assessment on the backend and extension. Not a full engagement — a targeted review of the highest-risk areas. Here's what I'm looking at.

### Pre-launch security review scope

**1. API authentication and authorization**
The backend uses Clerk for auth. I need to verify: JWT validation is happening correctly on every protected route, tenant isolation actually isolates (a user in Org A cannot access data from Org B), and the webhook endpoints (Stripe, PayPal, Clerk) validate signatures before processing. Marcus said the recent security fixes covered tenant isolation — I'll verify that finding is complete, not partial.

**2. Secrets in environment variables**
No secrets hardcoded in the codebase. This sounds obvious but codebases acquire hardcoded secrets through accidents — test credentials, temporary API keys. I'll run gitleaks across the git history (not just the current branch) to confirm nothing was ever committed. git history matters — the current code can be clean while the history contains a secret that was committed and then "deleted."

**3. Dependency vulnerabilities**
Run `npm audit` across all four packages. Flag anything critical or high severity. If there are unfixed high-severity vulnerabilities in production dependencies at launch, that is an exposure.

**4. CORS configuration**
Marcus explicitly flagged this in the production readiness meeting: `CORS_ORIGIN` must be set to `https://console.mykka.ai` on the backend. I'll verify this is enforced correctly and that there is no wildcard CORS that would allow any origin to call the API.

**5. Rate limiting**
Is there rate limiting on the `/scan` endpoint (the one the extension calls for every prompt submission)? Without rate limiting, a malicious actor who reverse-engineers the extension API calls can hammer the backend and generate Anthropic API costs or degrade service for all tenants. This needs to be in place before launch.

**6. Data stored in violation records**
Noa mentioned this: the violations database may contain excerpt content from prompts that were flagged. If that content includes credentials, health data, or financial data — which it will, because that's what the detection engine catches — then that database has elevated sensitivity. I need to understand exactly what is stored in `violations` table rows, how it is secured, and whether it is encrypted at rest. Render Standard tier does not guarantee encryption at rest by default — we need to verify.

**7. Third-party security of the stack**
Clerk (identity): trusted, SOC 2 Type II certified, no issues.
Stripe (payments): trusted, PCI-DSS Level 1 certified, no issues.
Neon (Postgres free tier): I need to review their security posture before we store real user data there. Their free tier may have limitations on encryption and access controls. If it does not meet our minimum bar, we move to a paid tier or Render Postgres.

**8. Extension permissions model (Chrome)**
The extension requests access to page content on AI sites. I'll review the manifest permissions to confirm they are scoped to the minimum necessary (not `<all_urls>` when only specific sites are needed). Overly broad permissions will trigger a more rigorous Chrome Web Store review and concern enterprise IT departments reviewing extension deployments.

### Israeli Privacy Protection Regulations — technical input

For the database registration and security level classification (Noa's responsibility), I'll provide the technical input:

- **User/org database (names, emails, roles):** Standard level. Technical controls required: access controls, audit logging, defined retention. Ryan already has most of these.
- **Violations database (flagged prompt content):** Likely Medium level given the potential for health, financial, and credential data in the flagged content. Additional controls required at Medium: security officer designation, access logs, background check for those with access, and notification to data subjects in some cases. We need to design around this.

### Cookie consent / tracking on mykka.ai

Quick check on the marketing site: if it uses Google Analytics or any other tracker, a cookie consent banner is required before launch for GDPR compliance. I'll check the mykka-web codebase for any tracking scripts and report back within the day.

### My pre-launch security checklist

| Item | Finding expected | Timeline |
|---|---|---|
| API auth / tenant isolation verification | Verify Marcus's security fixes are complete | 3 days |
| gitleaks scan of git history | No secrets in history | 1 day |
| npm audit across all packages | No unfixed critical/high CVEs | 1 day |
| CORS configuration verification | Confirm no wildcard CORS | 1 day |
| Rate limiting review on /scan endpoint | Confirm exists, or flag for Arjun to add | 2 days |
| Violations table data schema review | Confirm what PII is stored, how secured | 2 days |
| Neon free tier security posture review | Confirm acceptable for production | 1 day |
| Extension manifest permissions review | Confirm minimum necessary permissions | 1 day |
| mykka-web tracking script audit | Check for trackers requiring cookie consent | 1 day |

**Total: 1 week of focused work. I start Monday. Results to Noa and Marcus by end of next week.**

---

## Part 6 — Ethan: Entity Decision + Next Steps

**ETHAN:** So to make sure I understand the entity question. עוסק מורשה — wrong answer for all four of you?

**YAEL:** Correct. Personal liability, no investment capability, no Section 102 options, no IIA grants, enterprise customers resist it. Do not do it.

**AVI:** The tax math alone is disqualifying. You are building IP-driven SaaS. Preferred Technology Enterprise status at 7.5% tax vs. 50% personal income tax is not a close call.

**ETHAN:** So חברה בע"מ, same-day via shelf company. Yael, you can arrange that?

**YAEL:** Yes. I have a law firm that can open a shelf company by end of business tomorrow if you give me the go-ahead and the names of all shareholders today. I need: full legal names, ID numbers (תעודת זהות), percentage of shares, and the company name you want to register. We file the Articles of Association and shareholders register simultaneously.

**ETHAN:** What about bank account — who starts that process?

**AVI:** You do, physically. The bank requires the company registration certificate (תעודת התאגדות), the Articles of Association, the identity documents of all signatories, and a meeting with a branch manager. Bank Hapoalim and Leumi are the standard choices for tech companies. Mizrahi-Tefahot is sometimes faster. I'd call all three on Monday and take whichever appointment comes first. This cannot be delegated and it cannot be rushed — banks are what they are.

**ETHAN:** And Stripe — we cannot go live with Stripe until the entity exists?

**AVI:** You can go live with Stripe registered to whatever entity you have. If you have a US entity already — Delaware LLC, C-Corp — register Stripe there, collect revenue, and transfer to the Israeli entity later with a properly documented intercompany arrangement. I handle the transfer pricing. If you have no entity anywhere, you are personally receiving business income. That is the only genuinely bad option.

**ETHAN:** I need to check the US entity question this week. If we have one, we register Stripe to it and proceed. Yael and Avi, entity registration starts tomorrow. Bank account: I call the banks Monday.

Noa and Tal — the pre-launch security review. One week?

**TAL:** One week for the assessment. If I find something that needs fixing, add a few days for Arjun and Ryan to remediate.

**NOA:** The Privacy Policy and ToS are the other gate. Yael drafts them, I review the technical accuracy section. If we run those two tracks in parallel — security review and legal docs — we can be in a position to go live in 10–14 days. The entity registration and bank account start now but don't block foreign user signups, only Israeli revenue.

**ETHAN:** So the realistic timeline is:

| Item | Owner | By |
|---|---|---|
| חברה בע"מ registered (shelf) | Yael + Ethan | June 14 |
| Business bank account application | Ethan | June 16 |
| VAT registration | Avi | June 17 |
| Pre-launch security review | Tal | June 20 |
| Privacy Policy + ToS drafted | Yael | June 20 |
| Cookie consent / tracker check | Tal | June 14 |
| Incident response procedure | Noa | June 16 |
| Data retention policy | Noa | June 20 |
| DPA template | Yael + Noa + David Horowitz | June 20 |
| PPA database registration | Yael | June 21 (after entity confirmed) |
| Stripe moved to company entity | Ethan + Avi | After entity confirmed |
| Privacy Policy live on website | Ethan | June 21 |
| Web stack production deploy | Ryan | June 21–22 (pending legal docs live) |
| Chrome extension submitted | Marcus + Ryan | Same day as web deploy |

**NOA:** One flag. If Tal finds a critical vulnerability in the security review, the deploy date moves. Not a planning failure — that's the process working correctly.

**ETHAN:** Agreed. We don't ship a known critical vulnerability. Anything else before I close this?

**YAEL:** One more thing: the name on the company. "mykka.ai" as a trading name is fine, but the registered company name in Israel must be in Hebrew or include a Hebrew transliteration. Something like: "סייו טכנולוגיות בע"מ" (Mykka Technologies Ltd.) or similar. We decide this tomorrow when I start the paperwork.

**AVI:** Also: the shareholders agreement — who owns what. If there are co-founders, this is the moment to document it. Handshake agreements about equity are legally meaningless once there is a real company. Yael will prepare a basic shareholder agreement simultaneously with the Articles of Association.

**ETHAN:** Understood. I'm sending both of you the shareholder structure today. We are done here.

---

## Action Items — Full Summary

| # | Action | Owner | Deadline |
|---|---|---|---|
| 1 | Ethan provides shareholder names, IDs, percentages to Yael | Ethan | June 13 (today) |
| 2 | Register חברה בע"מ via shelf company | Yael | June 14 |
| 3 | Confirm US entity existence → Stripe registration plan | Ethan + Avi | June 14 |
| 4 | Open business bank account applications (Hapoalim, Leumi, Mizrahi) | Ethan | June 16 |
| 5 | VAT (מע"מ) registration after entity | Avi | June 17 |
| 6 | Cookie consent / tracker check on mykka-web | Tal | June 14 |
| 7 | Incident response + breach notification procedure | Noa | June 16 |
| 8 | Pre-launch security assessment (8-point checklist) | Tal | June 20 |
| 9 | Privacy Policy + Terms of Service draft | Yael | June 20 |
| 10 | Privacy Policy technical accuracy review | Noa | June 21 (after Yael draft) |
| 11 | Data retention policy | Noa | June 20 |
| 12 | DPA template | Yael + Noa + David Horowitz | June 20 |
| 13 | Shareholders agreement | Yael | June 17 |
| 14 | PPA database registration filing | Yael | June 21 |
| 15 | Privacy protection security level classification | Noa + Tal | June 21 |
| 16 | Stripe/PayPal moved to company entity | Ethan + Avi | After entity + bank account |
| 17 | Privacy Policy + ToS live on mykka.ai website | Ethan | June 21 |
| 18 | Production web stack deploy (pending legal docs) | Ryan | June 21–22 |
| 19 | Chrome extension submitted to Web Store | Marcus + Ryan | June 21–22 |
| 20 | Section 102 option plan setup | Avi + Yael | 4 weeks post-entity |
| 21 | IIA grant pre-application assessment | Avi | 2 weeks post-entity |
| 22 | SOC 2 program design | Noa | 2–4 weeks post-launch |
| 23 | Israeli bank account open (target) | Ethan | ~July 7 (2–4 weeks) |
