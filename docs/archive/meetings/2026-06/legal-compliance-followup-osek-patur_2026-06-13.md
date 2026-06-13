# ciyo.ai — Entity Decision Follow-Up: עוסק פטור as Starting Point
**Date:** June 13, 2026 (same day, reconvened)
**Chair:** Ethan Cole (CEO)
**Attendees:** Yael Mizrahi (Israeli Tech Lawyer), Avi Shapiro (Israeli CPA), Noa Katz (CISO), Tal Ben-David (Cybersecurity Specialist)
**Context:** Owner reviewed the morning meeting output and issued a directive: start as עוסק פטור (VAT-exempt sole proprietor, under ₪120K/year threshold). No employees, no investors, solo operation for now. Team reconvened to assess what this changes, what it doesn't, and what still blocks launch.

---

## Ethan Opens

**ETHAN:** The owner came back with a verdict. He's going solo — no co-founders, no employees, no investors right now. He wants to start as עוסק פטור. The logic: it's under the ₪120K VAT threshold, it takes 10 minutes to register, no bank account delays, no company overhead. When the business grows past ₪120K or he lands his first Israeli enterprise customer, he switches. He's asking: does this work? What still holds us back?

Yael, go.

---

## Yael — Legal

**YAEL:** Legally, עוסק פטור is a valid starting point for a solo founder targeting international customers. I'm not going to fight this decision. But I need to make three things clear.

**First: the entity registration itself takes 10 minutes.** Go to mas.gov.il, register as עוסק פטור. You receive an עוסק פטור number (same as your תעודת זהות in most cases). Done. No lawyer needed, no fee, no waiting. This is genuinely the simplest legal structure available in Israel.

**Second: what changes from our morning discussion.**
- No business bank account needed. Personal account is fine for עוסק פטור. The 2–4 week bank account bottleneck: gone.
- No Articles of Association, no shareholders agreement, no company registration. Gone.
- No Section 102 option plan. Irrelevant — no employees.
- No IIA R&D grant applications. Cannot apply as an individual. But he said no investors, so future grants are a future problem.
- No VAT returns to file ever, as long as revenue stays under ₪120K.

**Third: what does NOT change.**

Privacy Policy and Terms of Service: mandatory before the first user signs up. Doesn't matter if you're an individual or a company — you are a data controller the moment someone creates an account. I still draft these. One week.

PPA database registration: still required once you store personal data of 10+ Israeli individuals. The database owner can be an individual (עוסק פטור). I file this in your name. Same timeline.

All contracts with customers: signed as "Yarin [surname], עוסק פטור." Legally enforceable. International customers won't care. Israeli enterprise customers might raise an eyebrow but it's not a dealbreaker at early stage.

**One flag:** the exit question. I said it this morning and I'll say it once more for the record. If this product is sold while it lives inside an עוסק פטור, the sale of business IP is taxed as **income**, not capital gains. Up to 50% vs. 25%. You are aware of this and you've decided it's a future problem. Noted. I won't raise it again until you ask.

---

## Avi — Accounting & Tax

**AVI:** Financially this is the cleanest possible setup. Almost nothing to do. Let me be specific.

**What you need to do to be legal as עוסק פטור:**

One: Register on mas.gov.il as עוסק פטור. 10 minutes. Free.

Two: Register with Bituach Leumi (National Insurance Institute) as an עצמאי (self-employed). This one people forget. It is not optional. As a self-employed person in Israel you pay monthly Bituach Leumi contributions — approximately 12% of your income, with a minimum contribution even at zero income. You register at btl.gov.il or walk into any branch. If you skip this and they find out, you owe back-contributions plus interest. Don't skip it.

Three: Annual income tax return (דוח שנתי). As an עצמאי you file a personal income tax return each year. Deadline is April 30 of the following year (or May 31 with an extension). I prepare this for you.

**That's the entire setup. Three items.**

**Tax reality under ₪120K:**
- First ₪77,400: 10–14% effective income tax (after personal allowances, you may pay close to zero on the first ₪50K)
- ₪77K–₪120K: 20–31%
- Bituach Leumi: ~12% on top
- VAT: zero. You don't charge it, you don't file it.

So at ₪120K gross revenue, your effective combined tax burden is roughly 25–35% depending on deductions. Not great, not terrible. Tolerable for a bootstrapped early-stage product.

**What you CANNOT do with input VAT:**
As עוסק פטור, you pay VAT on Israeli business expenses — Yael's fees, software subscriptions purchased in Israel, equipment — and you cannot reclaim it. For a mostly-digital product with minimal Israeli expenses, this cost is small. If Israeli business expenses are significant, this becomes a reason to upgrade to עוסק מורשה sooner.

**The ₪120K ceiling:**
The moment your cumulative revenue in any 12-month rolling period crosses ₪120,000 (the current threshold — Avi checks annually for adjustments), you are legally required to notify the Tax Authority within 30 days and upgrade to עוסק מורשה. Missing this triggers penalties. I set a revenue tracker for you and alert you at ₪90K to give you time to prepare the upgrade.

**Stripe and PayPal:**
Register both under your personal Israeli ID. Revenue lands in your personal bank account. Tax return includes this income. Simple. No intercompany complexity.

---

## Noa — CISO

**NOA:** The entity type is irrelevant to security and privacy obligations. You are still a data controller. The law doesn't care if the controller is a company or an individual.

**What changes for me: nothing.**

**What still needs to happen before launch:**

Privacy Policy: must accurately describe data flows, storage location (Render US East), retention periods. Yael drafts, I review the technical accuracy section. One week.

GDPR cookie consent on the website: if any third-party tracker exists on ciyo.ai. Tal checks today.

Incident response procedure: one page. If there is a data breach, what happens. Who does the owner notify, within what timeframe (72 hours for GDPR, PPA equivalent for Israeli data). I write this in two days. As a solo operator, this document is "what I do when I wake up and something is wrong" — it can be simple.

Data retention policy: how long are flagged violations stored in the database. Pick a number, document it, implement the scheduled deletion. Coordinate with Arjun on the backend side.

PPA database registration: Yael files in the owner's name. We still need to classify the security level. As an individual data controller at the Standard level, the controls required are basic — access controls, defined retention, audit logging. Ryan already has most of this. Nothing new to build.

**One nuance at this scale:**
SOC 2 becomes relevant only when enterprise customers ask for it. At the עוסק פטור stage with no employees and solo operation, no enterprise customer is going to sign before you have it anyway — because you're not pitching enterprises yet. SOC 2 is a Phase 2 problem. I'll start the program design when you're ready. Not now.

---

## Tal — Cybersecurity

**TAL:** Entity type: irrelevant to my work. Pre-launch security checklist is identical.

**What I'm doing this week regardless:**

- gitleaks scan: no secrets in git history
- npm audit: no critical/high unpatched CVEs
- API auth verification: tenant isolation confirmed, JWT validation on every route
- CORS: confirm no wildcard, only console.ciyo.ai
- Rate limiting on /scan endpoint: confirm it exists, or flag Arjun to add it
- Violations table review: what PII is actually stored, is it encrypted at rest on Neon
- Neon free tier security posture: acceptable for production or not
- Extension manifest permissions: minimum necessary scope
- ciyo-web tracker check: any scripts needing cookie consent

**One thing that changes at עוסק פטור scale:**

The "security officer" requirement under Privacy Protection Regulations kicks in at Medium security level. At Standard level (likely where we start), there is no mandatory security officer designation. As a solo operator you are effectively your own security officer anyway. If we classify the violations database as Medium level, the regulations require a formally designated security officer — which is just you, documented in the PPA registration. Not a blocker, just a form to fill.

**My timeline: one week. Same as before.**

---

## Blockers Remaining — What Still Holds Us Back

**ETHAN:** So what actually still blocks the launch?

**YAEL:** Two hard blockers:
1. Privacy Policy + ToS not live on the website — required before first signup
2. PPA database registration — required before storing Israeli personal data (can overlap with launch if initial users are all foreign)

**AVI:** One administrative item that cannot be skipped:
1. Bituach Leumi registration as עצמאי — do this the same day you register on mas.gov.il. Takes 20 minutes.

**NOA:** Two blockers I won't move on:
1. Privacy Policy technical accuracy sign-off (I review after Yael drafts)
2. Cookie consent on website if any trackers found

**TAL:** One conditional blocker:
1. If the security review finds a critical vulnerability — deploy waits until it's fixed. No exceptions.

---

## Revised Timeline

| Item | Owner | By |
|---|---|---|
| Register עוסק פטור on mas.gov.il | Ethan | Today — 10 min |
| Register with Bituach Leumi as עצמאי | Ethan (Avi guides) | Today — 20 min |
| Cookie consent / tracker check on ciyo-web | Tal | June 14 |
| Incident response procedure | Noa | June 16 |
| Pre-launch security review (8-point) | Tal | June 20 |
| Privacy Policy + ToS draft | Yael | June 20 |
| Privacy Policy technical review | Noa | June 21 |
| Data retention policy | Noa | June 20 |
| PPA database registration (owner's name) | Yael | June 21 |
| Privacy Policy + ToS live on ciyo.ai | Ethan | June 21 |
| **Web stack production deploy** | Ryan | **June 21–22** |
| Chrome extension submitted | Marcus + Ryan | June 21–22 |
| Revenue tracker alert at ₪90K | Avi | Ongoing |

**Gone from previous plan:**
- ~~חברה בע"מ registration~~ — not needed now
- ~~Business bank account application (2–4 weeks)~~ — personal account works
- ~~Articles of Association / shareholders agreement~~ — not needed
- ~~VAT registration~~ — exempt below threshold
- ~~Section 102 option plan~~ — no employees
- ~~IIA grant assessment~~ — not applicable yet
- ~~Stripe moved to company entity~~ — registers under personal ID

**ETHAN:** Timeline is the same but the blockers are down from 23 items to 12, and the bank account delay is gone. We can realistically deploy June 21–22. Anything else?

**AVI:** One thing. The moment revenue approaches ₪90K — you call me. Don't wait for ₪120K to think about the structure. The upgrade to עוסק מורשה is straightforward, but if you're close to the threshold and an enterprise deal is about to close, we plan the timing of the switch carefully so you don't accidentally cross mid-quarter.

**YAEL:** And if at any point an acquirer shows interest — call me before you respond to them. The exit structure from עוסק פטור is manageable if we prepare for it. Messy if we don't.

**ETHAN:** Understood. We're done.

---

## Final Action Items

| # | Action | Owner | Deadline |
|---|---|---|---|
| 1 | Register as עוסק פטור on mas.gov.il | Ethan | Today |
| 2 | Register with Bituach Leumi as עצמאי | Ethan (Avi guides) | Today |
| 3 | Cookie consent / tracker audit on ciyo-web | Tal | June 14 |
| 4 | Incident response + breach notification procedure | Noa | June 16 |
| 5 | Pre-launch security review (8-point checklist) | Tal | June 20 |
| 6 | Privacy Policy + ToS draft | Yael | June 20 |
| 7 | Data retention policy | Noa | June 20 |
| 8 | Privacy Policy technical accuracy review | Noa | June 21 |
| 9 | PPA database registration (individual owner) | Yael | June 21 |
| 10 | Privacy Policy + ToS live on website | Ethan | June 21 |
| 11 | Web stack production deploy | Ryan | June 21–22 |
| 12 | Chrome extension submitted to Web Store | Marcus + Ryan | June 21–22 |
| 13 | Revenue alert system at ₪90K threshold | Avi | Ongoing |
