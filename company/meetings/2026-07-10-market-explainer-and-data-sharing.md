# Meeting Transcript — Market Explainer & Data-Sharing Opt-In

**Date:** 2026-07-10
**Called by:** Yarin (Founder/Owner)
**Chair:** Ethan Cole (CEO)
**Attendees:**

| Name | Role | Why in the room |
|---|---|---|
| Ethan Cole | CEO | Chair, final call |
| Priya Nair | Head of Marketing | Owns the external narrative |
| Megan O'Brien | Content & SEO Writer | Will write the actual pages |
| Sofia Reyes | VP Sales | Buyer objections, deal impact |
| Dimitri Stavros | Sales Engineer | Security questionnaires, POC reality |
| Marcus Webb | CTO | Technical accuracy of every claim |
| Ben Cho | Product Manager | Owns the opt-in feature question |
| David Horowitz | General Counsel | Privacy/GDPR framing |
| Noa Katz | CISO | How CISO buyers will read our claims |
| James Okafor | Head of Customer Success | How customers actually misunderstand us |

**Agenda:**
1. How do we explain mykka.ai / Pretzel to people who've never heard of us — why the engine helps with DLP, what a "policy" is, why AI is only in policy creation and NOT in the interception engine.
2. Should orgs get a "share data with Pretzel" opt-in? First: what data actually leaves the device today?

---

## Item 1 — Explaining the engine to people who don't know us

**Ethan:** What's the decision? We need one story that a CISO, an IT admin, and a curious employee can all repeat correctly. Today they can't. Priya, frame the problem.

**Priya:** The problem is that we're an AI-security company whose core product deliberately does *not* use AI, and that sounds like a contradiction until you explain it — and right now nobody explains it. When a prospect hears "AI DLP for ChatGPT," they assume we're an AI reading their prompts. That assumption is wrong in the way that *hurts* us: it makes us sound like the data-leak risk we're supposed to prevent. The truth is our best marketing asset and we're not using it.

**Marcus:** Let me state the truth precisely so marketing doesn't drift from it. The interception engine — extension and desktop proxy — runs `@mykka/detect` locally on the device. It's deterministic: pattern layers, regexes, entropy checks, PII classifiers. No model call, no network call in the detection path. A prompt is scanned in milliseconds on the user's machine before it leaves for ChatGPT, Claude, or Gemini. The *only* place an LLM exists in our stack is the backend policy assistant — an admin types "we're a fintech, protect customer PII and our repo names" and the assistant drafts policy rules. The admin reviews and publishes. The model proposes; it never enforces.

**Noa:** And that separation is exactly what a CISO wants to hear, for three reasons. One: determinism. When the engine blocks something, I can tell an auditor *which rule* fired and *why* — same input, same result, every time. An LLM-based blocker can't promise that; it's probabilistic, and "the model felt like it" doesn't survive a compliance review. Two: latency and availability — local regex runs in milliseconds and works offline; a model call adds a round trip and a failure mode on every keystroke of the company's workflow. Three: the irony test — a DLP tool that ships your prompts to a third-party AI to check if they're safe has just leaked the data it was guarding. We pass that test *by architecture*, not by promise.

**Dimitri:** I can confirm this is the number-one question in every security questionnaire and every POC: "Do you send our prompts to your cloud?" and "Is there an AI reading our data?" Right now I answer it verbally every single time because there's no page I can link. That's a sales-cycle tax on every deal.

**Sofia:** It's worse than a tax — it's a silent disqualifier. Some prospects don't ask; they assume we're prompt-harvesting and quietly drop us. The ones who *do* ask, we win, because the answer is great. So the fix is making the answer unavoidable: on the homepage, in the deck, in the first demo minute.

**Ethan:** Okay. So what's the story? Priya, give me the plain-language version. Pretend I'm an office manager, not a CISO.

**Priya:** Three sentences, no jargon:

> **"Your employees paste things into ChatGPT that should never leave the building — customer data, source code, API keys. Pretzel is a checkpoint that lives on their own computer: it checks each prompt against your company's rules *before* it's sent, and warns or blocks right there. The rules are yours; AI only helps your admin *write* them — it never sees your employees' prompts."**

Then for the skeptical reader, one level deeper — the guard-dog framing: the engine is a trained guard dog, not a mind-reader. It checks prompts against a fixed list of things *you* said matter. Fast, predictable, explainable. The AI is the consultant who helped you decide what the dog should watch for — and the consultant never stands at the gate.

**Megan:** And "policy" needs its own plain definition, because outside our bubble it means "a PDF nobody reads." Draft: *"A policy is your company's do-not-share list, written as concrete rules: 'credit card numbers — block', 'source code — warn first', 'customer names — log it'. Each rule says what to look for and what happens when it's found."* Then the AI sentence lands naturally: writing those rules from scratch is the tedious part, so an AI assistant in the admin console drafts them from a description of your business — and the admin approves before anything goes live. AI at design time, deterministic engine at run time.

**James:** From the CS side, please also make explicit what the engine *doesn't* do, because customers fill silence with fear. The three I get asked weekly: it does not read your ChatGPT *answers*, it does not train on your prompts — nothing to train, there's no model in the path — and your prompts do not sit on our servers. Say the negatives out loud. Silence reads as guilt in this market.

**Noa:** One caution: don't let copy say "your data never leaves your device," full stop. That's overclaiming — warn/block *events* do leave (we'll get to Item 2). The precise claim is: **"Your prompts are scanned on your device and are never sent to Pretzel's servers."** That sentence is true, defensible, and strong. Marketing must not round it up.

**Priya:** Agreed — and Alexei's team validates every capability claim per our operating rules before anything publishes. Deliverables I propose: a "How Pretzel Works" explainer page on mykka-web with a simple diagram — prompt → local check → allow/warn/block, with a side-note showing the AI assistant sitting next to the *admin*, not in the flow; an FAQ block ("Does AI read my prompts? No — here's why that's the point"); and a one-pager PDF of the same for Sofia's deck and Dimitri's questionnaires.

**Ethan:** Decision: that's the canonical story — "AI helps you write the rules; a deterministic local engine enforces them; prompts never leave the device for our servers." Priya owns the page and one-pager, Megan writes, Marcus reviews every technical sentence, Noa reviews the claims. Two weeks. Next item.

---

## Item 2 — "Share data with Pretzel" opt-in

**Ethan:** Yarin's question: do prompts get sent to our servers today without asking, and should orgs get an opt-in toggle? Marcus — facts first.

**Marcus:** The premise is wrong, and happily so. **We do not send prompts to our servers. Ever.** Verified against current code:

- Full prompt: scanned locally, never posted. Local audit log stores only a SHA-256 hash and character count — explicitly "we never persist the full text."
- `POST /v1/scans`: scan *count*, no body at all.
- `POST /v1/events`: fires only on warn/block findings, and only if the rule's `reportLevel` allows. It carries rule ID, action, hostname. Only at `reportLevel: rich` — a per-rule, org-configured setting — does it include the single matched term (e.g., the specific API key that tripped the rule). Never the surrounding prompt.
- Degraded-enforcement telemetry: hostname + failure reason, explicitly never content.

So the "does this tenant share data with Pretzel" knob **already exists** — it's `reportLevel` per rule: `none / minimal / medium / rich`. The org admin authors it in the policy.

**Ben:** Which reframes the question. It's not "add consent for prompt-sharing" — there's no prompt-sharing to consent to. It's two real gaps. **Gap one, packaging:** `reportLevel` is buried per-rule; no admin can answer "what does my org send Pretzel?" in one glance, and there's no single switch. **Gap two, disclosure:** the *employee* whose matched term gets reported at `rich` never sees that this is configured. My proposal: a tenant-level **Data Sharing** page in the console — a plain-English table of the four exhaust types (scan counts, degraded-telemetry, warn/block events, matched terms), plus one org-level ceiling setting, e.g. "maximum report detail: metadata only / include matched terms," which caps every rule's effective `reportLevel`. No new pipes, no new data — a visibility and control layer over what exists.

**David:** Legal view: because no prompt content is transmitted, we don't have a GDPR consent problem — we have a GDPR *clarity opportunity*. Matched terms at `rich` can be personal data (an email address, a name), so the tenant-level ceiling is genuinely useful for EU customers who want to run "metadata only" and simplify their processing records. I want three things: the DPA lists exactly these four data types and nothing else; the Data Sharing page uses the same wording as the DPA so sales, product, and legal say one thing; and default for new tenants is conservative — metadata only, admin raises it deliberately. Opt-in to detail, not opt-out.

**Noa:** Strong agree on default-conservative, with one addition: employee-side transparency. The extension popup should have a small "what leaves this device" line reflecting the org's current setting. Costs us nothing, and in a CISO evaluation it reads as confidence. Transparency is cheap when the underlying story is this good.

**James:** CS impact: this kills my single most repeated support conversation. Today when an employee asks "is my employer's DLP tool reading my chats?", I explain the architecture by hand. A settings page plus popup line makes it self-serve. Also — pilot customers *will* ask this in week one. Having the page before pilot start is worth real goodwill.

**Sofia:** And competitively it's a wedge. Cloud-scanning DLP vendors *must* ingest content — that's their architecture. We should sell the toggle as "you can run Pretzel in metadata-only mode and we literally cannot see a single matched term." Nightfall can't say that sentence. Put it in the battle card.

**Ethan:** Anything actually being sent today that would embarrass us if a pilot customer packet-sniffed the extension?

**Marcus:** No. Worst case is a `rich`-level matched term — which their own admin configured. The story is defensible end to end. The work here is UI, docs, and defaults, not data-flow surgery. Rough scope: console page (Chloe), backend ceiling setting merged into policy compile (Arjun), popup line (Yuki), DPA language (David). Small, parallelizable, fits post-pilot-hardening.

**Ethan:** Decisions. One: no consent blocker exists — correct the premise wherever it's written down. Two: build the tenant-level Data Sharing page with an org-wide report-detail ceiling, default metadata-only for new tenants. Three: employee-facing "what leaves this device" line in the popup. Four: DPA and page share identical wording. Ben owns the spec, Marcus routes the engineering, David the DPA text. Spec in one week; build scheduled after current pilot blockers clear — security-review criticals from July 8 stay ahead of this in the queue. Meeting closed.

---

## Decisions

| # | Decision | Owner |
|---|---|---|
| 1 | Canonical explainer narrative: "AI writes the rules with your admin; a deterministic local engine enforces them; prompts are never sent to Pretzel's servers." | Ethan (approved), Priya (executes) |
| 2 | "How Pretzel Works" page + FAQ + sales one-pager; Marcus + Noa review all claims; Alexei validates capability claims | Priya / Megan |
| 3 | Approved precise claim: "Prompts are scanned on-device and never sent to Pretzel's servers" — never "data never leaves your device" | Priya / Noa |
| 4 | Premise correction: prompts are NOT currently sent to servers; no consent gap exists | All |
| 5 | Tenant-level Data Sharing console page + org-wide report-detail ceiling (caps per-rule `reportLevel`); default metadata-only for new tenants | Ben (spec), Marcus (routing) |
| 6 | Employee-facing "what leaves this device" line in extension popup | Yuki (via Marcus) |
| 7 | DPA enumerates exactly the four exhaust data types; wording identical to console page | David |

## Action Items

| Owner | Action | Due |
|---|---|---|
| Priya / Megan | Draft explainer page, FAQ, one-pager | 2026-07-24 |
| Marcus | Technical review of all explainer claims | with draft |
| Noa | Claims review (no overclaiming) | with draft |
| Ben | Data Sharing feature spec (page, ceiling setting, popup line) | 2026-07-17 |
| David | DPA data-types language | 2026-07-24 |
| Sofia / Dimitri | Add "metadata-only mode" to battle card + questionnaire answers | after page ships |

## Verified technical facts (source of truth for this meeting)

- Detection is local and deterministic: `pretzel/src` (extension service worker) and `pretzel-desktop/electron/proxy.ts` both run `@mykka/detect` on-device; no LLM, no network call in the detection path.
- LLM usage exists only in `backend/src/assistant/` — the admin policy-drafting assistant (Anthropic/OpenAI/Groq providers). Output is proposed config; publishing requires admin action.
- Data leaving the device (per `pretzel/docs/runtime-and-data-flow.md` and `pretzel/src/events/dispatch.ts`, `pretzel/src/telemetry/dispatch.ts`): scan count (no body); warn/block events (rule ID, action, hostname); matched term only at per-rule `reportLevel: rich`; degraded telemetry (hostname + reason). Full prompts are never transmitted; local audit log stores hash + length only.
