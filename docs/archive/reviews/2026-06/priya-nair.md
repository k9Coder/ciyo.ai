# Marketing Review — Priya Nair, Head of Marketing
**Date:** 2026-06-08
**Scope:** mykka-web marketing site — 22 files reviewed through brand, messaging, SEO, and accuracy lenses.

---

#### `mykka-web/app/page.tsx` — Homepage route assembly
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** The page itself is clean composition, but it exports no page-level `metadata`. The root layout sets a solid default title/description, but the homepage gets no OG-title override, no `og:description` tailored to the homepage narrative, and no `og:image` path override (it inherits the default `/images/og-default.png` — which may or may not exist). For the most-trafficked URL on the site this is a missed SEO and social-share opportunity.
  **Proposed changes:** Add a named `metadata` export directly on `app/page.tsx`:
  ```ts
  export const metadata: Metadata = {
    title: 'Pretzel by mykka.ai — Stop AI Prompt Data Leaks',
    description: 'The Chrome extension that blocks PII, credentials, and IP from reaching ChatGPT, Claude, and Gemini. Installs in 30 seconds. Free for teams up to 3 users.',
    openGraph: { title: 'Pretzel — AI Prompt DLP for Enterprise', description: '...' },
  }
  ```

---

#### `mykka-web/app/product/page.tsx` — Product detail page (three surfaces)
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Placeholder screenshot boxes in production.** Each of the three feature sections renders a `<p className="text-[13px] text-[#64748b]">{tag} screenshot</p>` inside an empty box. These placeholder texts ("Browser Extension screenshot", "Pretzel Console screenshot", "AI Policy Assistant screenshot") are visible to every visitor, including enterprise evaluators. This is the single most damaging placeholder on the site.
  2. **Meta title too bare.** `title: 'Product'` renders in the browser tab and social cards as "Product | Pretzel" — no keyword value.
  3. **No `og:description` or `og:image` override.** Inherits generic layout defaults.
  4. **Missing analytics section.** The product has an Analytics Dashboard (listed in FeatureGrid and Pricing), but the Product page covers only three surfaces: extension, console, AI assistant. A CISO evaluating completeness will notice the gap.
  **Proposed changes:**
  - Replace all three placeholder `<p>` elements with real product screenshots or animated GIFs immediately. Until ready, use a branded "screenshot coming soon" treatment — but not plain grey text on a grey box.
  - `title: 'How Pretzel Works — Browser DLP for AI Tools'`
  - `description: 'Extension, admin console, AI policy assistant, and analytics — four surfaces, one mission: stop sensitive data from reaching AI tools.'`
  - Add a fourth section for the Analytics Dashboard.

---

#### `mykka-web/app/pricing/page.tsx` — Full pricing page with toggle
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Missing `metadata` export entirely.** The pricing page is a `'use client'` component and exports no metadata at all — title, description, OG tags are all absent. Search engines and link unfurls fall back to the root layout defaults. Pricing pages are high-intent; they need their own crawlable meta.
  2. **FAQ answer for scan limit on free tier is vague and slightly misleading.** "the extension continues to run but the Console shows an upgrade prompt" — does the extension actually continue scanning after 500 scans? If scanning stops, this is an inaccurate claim.
  3. **"Start Starter" CTA label is awkward.** A CISO forwarding the pricing page to their CFO will notice this copy. It sounds like a draft label.
  4. **"Talk to Sales" links to `mailto:sales@mykka.ai`.** For enterprise prospects this is fine, but there is no Calendly or demo-booking link — high friction for a buyer whose CISO instinct is to book a call, not compose an email.
  5. **No social proof on pricing page.** No logos, no testimonials, no "join X companies" line. Pricing pages convert better with trust signals adjacent to the purchase decision.
  **Proposed changes:**
  - Move pricing data to a separate non-`'use client'` file or use a wrapper pattern so metadata can be exported from a server component.
  - `title: 'Pricing — Pretzel AI DLP | Free to $15/user/mo'`
  - Fix FAQ wording: be explicit whether scanning stops or degrades at the limit.
  - Rename "Start Starter" → "Start Free Trial" or "Get Starter".
  - Add a Calendly/demo booking link as the enterprise CTA alongside the mailto.
  - Add a "Trusted by 200+ security teams" line with 3–4 logo placeholders above the grid.

---

#### `mykka-web/app/solutions/page.tsx` — Solutions hub (by industry)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **Meta title "Solutions" is too generic.** Renders as "Solutions | Pretzel" in SERPs, competing with nothing meaningful.
  2. **"Pretzel ships with starter templates for each"** — confirm "templates" actually exist and are one-click activatable at launch. If the industry-specific policy templates are not yet in the product, this is an inaccurate claim.
  3. **Four industries only.** The header nav and target buyer profile (CISOs at 200–5000 employee companies) suggests government contracting is a strong ICP vertical — it is listed in positioning but absent from the solutions hub.
  **Proposed changes:**
  - `title: 'AI Security Solutions by Industry — Healthcare, Legal, Fintech, Engineering'`
  - `description: 'Pre-built AI DLP policies for regulated industries. Pretzel ships with one-click policy templates for HIPAA, PCI-DSS, attorney-client privilege, and developer credential protection.'`
  - Consider adding Government Contracting as a fifth tile (CUI, ITAR, CMMC angle).
  - If templates are not yet live, soften: "Pretzel ships with policy starter kits for each industry" and link to a doc, not an implication of a product button.

---

#### `mykka-web/app/solutions/[industry]/page.tsx` — Individual industry solution pages
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Stat citations missing or unverifiable.**
     - Healthcare: "94% of healthcare orgs had at least one AI-related data concern in 2025" — no source attributed.
     - Legal: "67% of Am Law 200 firms have no AI usage policy as of 2026" — no source. If this is mykka.ai research, say so. If it is from a third party, cite it.
     - Engineering: "1 in 3 developer AI prompts contain at least one credential or secret (mykka.ai data, 2026)" — this one attributes mykka.ai, which is good, but requires the underlying data to actually exist and be defensible. If this stat is based on internal platform data, it needs a methodology note or it is misleading.
     - Fintech: "$4.5B in financial regulatory fines tied to information security failures in 2025" — broad claim, no source.
  2. **Secondary CTA links point to blog posts that do not exist.** The blog posts `/blog/hipaa-ai-policy-template`, `/blog/legal-ai-usage-policy`, `/blog/fintech-ai-risk-template`, `/blog/engineering-ai-security-starter` are all referenced as CTAs but `lib/posts.ts` contains only one post (`ai-prompt-leakage`). Every one of these links is a 404 waiting to happen — and CISOs clicking "Download Free HIPAA AI Policy Template" and hitting a 404 will not return.
  3. **OG description is minimal.** `description: data.headline` is the section headline verbatim — fine as a fallback but not optimised for SERP click-through.
  **Proposed changes:**
  - Add source attribution or remove the stats entirely. Unattributed stats in a security context erode CISO trust faster than having no stat at all.
  - Either create the four referenced blog posts immediately, or temporarily redirect the CTA links to the one existing post or a "coming soon" landing form.
  - `description` override: `${data.headline}. ${data.problem.slice(0,120)}…`

---

#### `mykka-web/app/security/page.tsx` — Security & Trust page
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **"SOC 2 Type II — in progress"** is the right way to say this — honest, not overpromising. Good. But there is no timeline given ("we expect to complete our audit by Q3 2026" would give enterprise buyers a reference point) and no link to a Vanta/Drata trust portal or any interim controls documentation.
  2. **"GDPR & CCPA ready"** — the phrase "GDPR & CCPA ready" is commonly misread as "certified compliant." Consider "GDPR & CCPA aligned" or "designed for GDPR & CCPA compliance." Also: "Data is stored in the EU by default" — what region exactly? AWS eu-west-1? This matters to healthcare buyers in Germany.
  3. **No bug bounty program link.** The disclosure policy says "email security@mykka.ai" but there is no mention of HackerOne, Bugcrowd, or a public policy page. CISOs at 500+ seat companies will want a formal program.
  4. **No pen test or third-party audit mention.** Even "last assessed by [firm] in Q1 2026" would help enterprise evaluators.
  5. **No downloadable DPA.** The page says "we are happy to sign a DPA" but does not link to a standard DPA template. Enterprise procurement will ask for this and the friction costs deals.
  6. **Meta description** is generic: "How Pretzel handles your data — encryption, retention, and compliance." Could be sharper for CISO searches.
  **Proposed changes:**
  - Add: "SOC 2 audit targeted for Q3 2026 — interim controls documentation available on request."
  - Link to a downloadable DPA PDF or at minimum a "request our DPA" form.
  - Add a pen test mention if one has been conducted.
  - `description: 'Pretzel never stores prompt content. TLS 1.3, AES-256, EU data residency, SOC 2 Type II in progress. Honest answers to the questions CISOs actually ask.'`

---

#### `mykka-web/app/blog/page.tsx` — Blog listing page
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **Only one post exists** (`ai-prompt-leakage`). The blog listing page renders correctly, but a single post is thin for any SEO value and signals low content investment to a CISO who lands here expecting an authoritative resource.
  2. **No author attribution on listing.** B2B security buyers trust bylines. Anonymous posts get less credibility with CISOs than posts attributed to a named security researcher or practitioner.
  3. **No category/tag filter.** With only one post this is fine, but as content scales the listing needs filtering.
  4. **Meta description** — "Insights on AI security, data loss prevention, and enterprise AI governance" is decent but could include the brand name: "The Pretzel by mykka.ai blog: ..."
  **Proposed changes:**
  - Publish the four industry-specific posts referenced by solution page CTAs immediately. These are blocking 404s.
  - Add author name + title to the `Post` interface and render it on cards.
  - `description: 'The Pretzel blog: practical guides, research, and policy templates for CISOs managing AI data risk.'`

---

#### `mykka-web/app/blog/[slug]/page.tsx` — Individual blog post page
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **Markdown rendering is hand-rolled and fragile.** The content renderer strips `**bold**` markers using a replace regex but does not render the `<strong>` tag — it just removes the asterisks. The post content uses `**Pretzel rule type:**` heavily; all bold emphasis is silently dropped. This makes post body text less scannable.
  2. **No author, no estimated reading time, no social share buttons.** These are standard for B2B content that gets forwarded inside enterprise security teams.
  3. **OG image is not set per-post.** All blog posts share the layout default OG image. A CISO sharing a post to Slack will see a generic site image, not one branded to the post.
  4. **No related posts or next/prev navigation.** With one post this is trivial, but the architecture needs this before content scales.
  **Proposed changes:**
  - Fix the markdown renderer: replace `block.replace(/\*\*(.*?)\*\*/g, '$1')` with proper `<strong>` wrapping — either use `dangerouslySetInnerHTML` after sanitisation, or switch to `react-markdown`.
  - Add `author` field to the `Post` interface and render it.
  - Generate per-post OG images (Next.js `generateImageMetadata` or static per-post images).

---

#### `mykka-web/app/about/page.tsx` — About / company page
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **"We're funded by customers, not VCs."** This is a strong, differentiating brand claim — but it is potentially risky if the company ever takes VC funding without updating this page. Flag it for future accuracy monitoring.
  2. **No team section.** The about page has no names, no photos, no LinkedIn links. For enterprise buyers doing vendor due-diligence, anonymous founding teams are a yellow flag. Even "Founded by [Name], formerly [Company]" would help.
  3. **No press mentions, customer logos, or social proof.** The about page is often where prospects go after reading a security page to decide if the company is real and credible.
  4. **"hello@mykka.ai — we read every email and reply to most of them"** — charming copy for a consumer brand; slightly informal for a CISO-targeted enterprise product. Consider splitting into "hello@mykka.ai for general questions" and "sales@mykka.ai for enterprise discussions."
  5. **`description: 'The story behind mykka.ai and Pretzel.'`** — too vague for SEO.
  **Proposed changes:**
  - Add a two-sentence founding team bio with domain credentials.
  - `description: 'mykka.ai builds AI prompt data loss prevention for enterprise security teams. A small, customer-funded team obsessed with making DLP tools people actually use.'`
  - Split contact into two CTAs: "For product questions" / "For enterprise and sales."

---

#### `mykka-web/app/layout.tsx` — Root layout with global metadata
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`og:image` path `/images/og-default.png` is referenced but its existence is unverifiable from this review.** If the file is missing, every social share produces a broken image. This needs to be confirmed and the image should be 1200×630px with brand treatment.
  2. **No `og:title` or `og:description` set at layout level** — these are present implicitly via the `title` and `description` fields, but explicit OG overrides with slightly different copy (ad-style phrasing) convert better on social.
  3. **`twitter: { creator: '@mykka_ai' }`** — confirm this Twitter/X handle exists and is active. If the account is dormant or does not exist, this tag is noise.
  4. **No `canonical` URL pattern set.** Pages that are accessible via multiple paths (e.g., with/without trailing slash) will have duplicate content issues without a canonical strategy.
  5. **No `keywords` meta (deprecated but sometimes used by enterprise SEO audits).** Not critical.
  **Proposed changes:**
  - Verify `/images/og-default.png` exists and is correctly sized.
  - Confirm the `@mykka_ai` Twitter handle.
  - Add `alternates: { canonical: 'https://mykka.ai' }` at the layout level and override per-page.

---

#### `mykka-web/app/sitemap.ts` — XML sitemap generator
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **`/accessibility` is in the sitemap but has no corresponding route file in the reviewed set.** If `/app/accessibility/page.tsx` does not exist, this generates a 404 URL in the sitemap, which Googlebot will report as an error.
  2. **`/changelog` is linked from the Footer but is not in the sitemap.** If `/changelog` is a real page, it should be indexed. If it is not live, the Footer link is broken.
  3. **`/privacy` and `/terms` are linked in the Footer but absent from the sitemap.** These are important for GDPR and enterprise procurement compliance.
  4. **All static routes get `lastModified: new Date()`** — this stamps every static page with today's date on every build, which can cause unnecessary recrawling by search engines. Set accurate last-modified dates per-route.
  **Proposed changes:**
  - Remove `/accessibility` from the sitemap if the page does not exist, or create it.
  - Add `/privacy`, `/terms`, and `/changelog` to the sitemap if those pages are live.
  - Set static `lastModified` dates rather than `new Date()` for pages that rarely change.

---

#### `mykka-web/app/robots.ts` — Robots directive
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. `allow: '/'` with correct sitemap URL. No staging or internal paths being inadvertently indexed (the staging env is controlled via env var in the Header, not by robots.txt). No issues from a marketing perspective.
  **Proposed changes:** N/A

---

#### `mykka-web/components/sections/Hero.tsx` — Homepage hero section
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **"Extension screenshot placeholder"** text inside a prominent hero mock — this is the first thing every visitor sees below the fold and it is currently a grey box with grey placeholder text. This is visible in production and will destroy conversion for any CISO who arrives from an outbound email or LinkedIn ad.
  2. **"Now protecting teams at 200+ companies"** — this is a strong trust signal. However, if the actual number is lower than 200, this is a false claim. If it is higher, it is understated. The number needs to be accurate and kept current; hard-coded copy like this silently goes stale.
  3. **"Installs in 30 seconds"** — this claim appears three times across the site (Hero, HowItWorks step 01, CTABanner). Repetition is fine if the claim is accurate. Confirm the 30-second install is achievable end-to-end by a non-technical user, including the onboarding flow.
  4. **Secondary CTA "See How It Works →" links to `/product`** — that page has placeholder screenshot boxes (see product/page.tsx finding #1). The CTA destination is broken from a conversion standpoint.
  5. **No social proof logos below the hero.** The trust-builder copy "Trusted by security teams at healthcare, legal, and fintech companies" is text-only. Even placeholder logo silhouettes would outperform plain text on enterprise-targeted pages.
  **Proposed changes:**
  - Replace the screenshot placeholder with a real extension screenshot or an interactive GIF immediately. This is the highest-priority fix on the site.
  - Add 4–6 customer or recognisable-sector logo lockup below the trust-builder line.
  - Make "200+ companies" a variable or at minimum add a comment marking it as a manually-updated figure.

---

#### `mykka-web/components/sections/FeatureGrid.tsx` — Six-feature grid
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Copy is specific and technically accurate based on the product description. Feature titles align with pricing tier features and the product page. "Configured with a single CSS selector" for the "Works on All AI Sites" card is technically precise — this is good. No placeholders, no lorem ipsum, no broken CTAs. Section has no CTA of its own (expected for a features grid mid-page). Clean.
  **Proposed changes:** Minor — consider adding a CTA link at the bottom of the section ("See full feature breakdown →" linking to `/product`) to capture mid-page intent from CISO readers who stop at features before scrolling further.

---

#### `mykka-web/components/sections/CTABanner.tsx` — Bottom-of-page CTA banner
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **"See results immediately"** — "immediately" is a strong promise. The extension scans prompts immediately after install, but meaningful "results" (analytics, blocked events) require the team to actually trigger detection. Consider "See your first scan results within minutes" or soften to "Start seeing results from day one."
  2. **"Talk to Sales" links to `mailto:hello@mykka.ai?subject=Enterprise enquiry`** — the mailto goes to `hello@mykka.ai`, not `sales@mykka.ai`. The Pricing page uses `sales@mykka.ai`. There is an inconsistency in the sales contact email across the site. Pick one and make it consistent.
  3. **The enterprise sales inquiry subject line "Enterprise enquiry" uses British spelling** — fine for UK-targeted campaigns, slightly jarring for US enterprise prospects. Standardise to "Enterprise inquiry" or use a neutral subject.
  **Proposed changes:**
  - Standardise all "Talk to Sales" mailto links to `sales@mykka.ai` with subject "Enterprise inquiry".
  - Soften the "immediately" claim.

---

#### `mykka-web/components/sections/HowItWorks.tsx` — Three-step explainer
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Copy is clear, benefit-focused, and accurate. Step 02 mentions "one-click industry template" — this aligns with the Solutions page but confirm the templates are actually one-click in the product. The "No IT ticket, no proxy, no agent install" messaging is excellent CISO-targeted differentiation; it directly addresses the procurement objection. No placeholders, no inaccurate claims spotted. Section heading "From zero to protected in 30 minutes" is a specific, testable claim — confirm it is achievable for a mid-market security team.
  **Proposed changes:** N/A

---

#### `mykka-web/components/sections/PricingPreview.tsx` — Homepage pricing teaser
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **PricingPreview only shows three tiers (Solo, Starter, Business)** while the full `/pricing` page shows four (adding Enterprise). The homepage preview deliberately omits Enterprise, which is fine for conversion flow — but CISOs who scan pricing on the homepage may miss that an enterprise tier exists.
  2. **Solo tier description** changes between files: here it says "For individuals exploring Pretzel" but on `pricing/page.tsx` it says "For individuals validating Pretzel before recommending it." The second is more accurate CISO-targeted copy. Standardise to the stronger version.
  3. **Hardcoded `https://app.mykka.ai/onboarding` URLs** — these bypass the `APP_URL` config used elsewhere. If `APP_URL` ever changes (e.g., staging override), these links will not follow.
  **Proposed changes:**
  - Standardise Solo description: "For individuals validating Pretzel before recommending it to their team."
  - Replace hardcoded `https://app.mykka.ai/onboarding` with `${APP_URL}/onboarding` imports.
  - Add a fourth card stub for Enterprise with "Talk to Sales" to match the full pricing page, or add a more prominent "Enterprise pricing available →" callout below the grid.

---

#### `mykka-web/components/sections/VideoDemo.tsx` — Video demo section
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **"90-second explainer — coming soon"** is visible placeholder text in production. The section heading is "Watch Pretzel block a real leak" — promising a video that does not exist. This is a broken promise to every visitor, including enterprise evaluators. A CISO who clicks the play button and sees "coming soon" will not return.
  2. **The entire section occupies a large viewport area (`aspect-video`) for content that does not exist.** It is better to remove the section from production entirely until the video is ready, or replace it with a Loom-style embed of an actual screen recording.
  **Proposed changes:**
  - Either: (a) record and embed a real 90-second screen capture immediately — this does not need to be polished, a Loom recording suffices; or (b) remove the VideoDemo section from `app/page.tsx` entirely until the video is ready. Option (b) is the safer choice today.

---

#### `mykka-web/components/layout/Header.tsx` — Site-wide navigation header
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **No "Docs" link in the main nav** — the Footer includes a full Docs section with links to `docs.mykka.ai`, but the header nav omits it. Enterprise evaluators frequently want to jump directly to API docs or integration guides during evaluation.
  2. **The nav has no active-state indicator** — the current page link is not visually differentiated from inactive links. Minor UX issue but relevant for a SaaS product where navigation clarity affects demo walkthroughs.
  3. **`process.env.NEXT_PUBLIC_ENV === 'staging'` badge** renders in production if the env var is not set (it will be falsy, so the badge will not show). This is fine — no issue there.
  4. **Mobile nav closes on link click** — correct behaviour, no issues.
  5. **"Sign in" link has no aria-label** to distinguish it from "Start Free" for screen readers.
  **Proposed changes:**
  - Add "Docs" to the NAV array, linking to `https://docs.mykka.ai`.
  - Add active route highlighting using `usePathname()`.

---

#### `mykka-web/components/layout/Footer.tsx` — Site-wide footer
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **`/changelog` is listed under Product links but has no page file in the reviewed set.** If this route is not live, every visitor clicking "Changelog" hits a 404. Changelog pages are important trust signals for enterprise buyers — they show active development. If not ready, remove from footer.
  2. **`/privacy` and `/terms` are linked in the footer but have no corresponding page files in the reviewed set.** These are legally required for GDPR compliance (required to be accessible at all times) and are also required for app store / Chrome Web Store listing. If these pages do not exist, this is both a legal risk and a broken link.
  3. **`/accessibility` is linked in the footer with the Hebrew word "נגישות"** — the label is in Hebrew while the rest of the site is English. This is likely intentional for an Israeli-market regulatory requirement, but the language switch is jarring in an English-language global site. The link text should be bilingual or the page should redirect to an English accessibility statement with a Hebrew-language section.
  4. **External docs links (`https://docs.mykka.ai`, `https://docs.mykka.ai/api`, `https://docs.mykka.ai/enterprise`)** — these need to be verified as live. If docs.mykka.ai does not resolve, these are dead links in every visitor's footer.
  5. **No social media links** (Twitter/X, LinkedIn) in the footer despite `twitter: { creator: '@mykka_ai' }` in layout metadata.
  **Proposed changes:**
  - Remove `/changelog` from the footer until the page exists or redirect to the blog.
  - Create or stub `/privacy` and `/terms` pages immediately — these are non-negotiable legal requirements.
  - Add English text to the accessibility link: "Accessibility / נגישות".
  - Verify docs.mykka.ai is live before shipping.
  - Add Twitter/LinkedIn icons to the footer.

---

#### `mykka-web/lib/config.ts` — APP_URL configuration
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Correct pattern — `NEXT_PUBLIC_APP_URL` with a sensible production default. However, `PricingPreview.tsx` hardcodes `https://app.mykka.ai/onboarding` rather than using this export, creating an inconsistency (flagged in PricingPreview review above). Config itself is clean.
  **Proposed changes:** N/A (the fix belongs in PricingPreview.tsx).

---

#### `mykka-web/lib/posts.ts` — Blog post data store
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Only one post exists.** Four blog posts are directly linked as CTA destinations from solution pages (`/blog/hipaa-ai-policy-template`, `/blog/legal-ai-usage-policy`, `/blog/fintech-ai-risk-template`, `/blog/engineering-ai-security-starter`). None of these slugs exist in the posts array. Every one of these CTAs is a 404.
  2. **The bold markdown in the single existing post is not rendered** — the `[slug]/page.tsx` renderer strips `**` rather than converting it to `<strong>`. The post body reads fine as plain text, but the formatting intent is lost.
  3. **No `author` field on the Post interface.** For B2B credibility, posts need a named author.
  4. **`getPost` is a synchronous array find.** Fine at current scale; will need to move to a file-system or CMS solution once post count grows beyond ~20.
  5. **The single post description reads "We analysed 100,000 AI prompts"** — if this data does not come from the Pretzel platform (i.e., mykka.ai does not yet have 100,000 scanned prompts in production), this claim is inaccurate and should be corrected or the post should not be published yet.
  **Proposed changes:**
  - Add the four missing posts immediately (they can be shorter than the existing post — even 400-word policy template explainers with a downloadable link suffice).
  - Fix the bold rendering in `[slug]/page.tsx`.
  - Add `author: string` to the `Post` interface.
  - Verify the "100,000 AI prompts" data claim is based on actual platform data.

---

## Summary Table

| File | Verdict |
|---|---|
| `app/page.tsx` | WARN |
| `app/product/page.tsx` | ISSUE |
| `app/pricing/page.tsx` | ISSUE |
| `app/solutions/page.tsx` | WARN |
| `app/solutions/[industry]/page.tsx` | ISSUE |
| `app/security/page.tsx` | WARN |
| `app/blog/page.tsx` | WARN |
| `app/blog/[slug]/page.tsx` | WARN |
| `app/about/page.tsx` | WARN |
| `app/layout.tsx` | WARN |
| `app/sitemap.ts` | ISSUE |
| `app/robots.ts` | PASS |
| `components/sections/Hero.tsx` | ISSUE |
| `components/sections/FeatureGrid.tsx` | PASS |
| `components/sections/CTABanner.tsx` | WARN |
| `components/sections/HowItWorks.tsx` | PASS |
| `components/sections/PricingPreview.tsx` | WARN |
| `components/sections/VideoDemo.tsx` | ISSUE |
| `components/layout/Header.tsx` | WARN |
| `components/layout/Footer.tsx` | ISSUE |
| `lib/config.ts` | PASS |
| `lib/posts.ts` | ISSUE |

**Totals: 4 PASS / 9 WARN / 9 ISSUE**

---

## Top 5 Most Important Marketing Issues

### 1. Placeholder content is live in production (CRITICAL)
Three files contain visible placeholder text that real visitors see today:
- **Hero.tsx**: "Extension screenshot placeholder" — the first visual below the fold
- **product/page.tsx**: Three instances of `{tag} screenshot` in empty grey boxes
- **VideoDemo.tsx**: "90-second explainer — coming soon" with a fake play button

A CISO who lands from a cold email, a LinkedIn ad, or a Google search and sees placeholder copy will not book a demo. This is the single highest-priority fix. Get real screenshots into Hero and Product immediately; remove VideoDemo from the page until a real video exists.

### 2. Four CTA links are dead 404s (HIGH)
The solution pages for healthcare, legal, fintech, and engineering each have a secondary CTA linking to a blog post that does not exist. These are active links on live pages. A prospect who clicks "Download Free HIPAA AI Policy Template" and gets a 404 will not try again. Write and publish these four posts this week — they can be short. Until they are live, redirect the CTAs to the existing post or a contact form.

### 3. Pricing page has no metadata and legal pages do not exist (HIGH)
`/pricing` is a `'use client'` component with no `metadata` export — it is effectively invisible to search engines under its own title. Additionally, `/privacy` and `/terms` are linked in the footer but have no corresponding pages. For enterprise buyers and GDPR compliance, Privacy Policy and Terms of Service must be accessible from every page. Create these pages immediately.

### 4. Unverifiable statistics damage CISO credibility (MEDIUM)
The industry solution pages cite four statistics with no source attribution. Security buyers are trained to challenge data. An unattributed "67% of Am Law 200 firms have no AI usage policy" or a self-cited "1 in 3 developer prompts contain a credential" without methodology will be challenged in an enterprise sales call. Attribute every stat to a named source, or replace with softer phrasing backed by the one verifiable mykka.ai data point from the existing blog post.

### 5. No product screenshots anywhere on the site (HIGH)
The marketing site has zero real product visuals — no screenshots, no GIFs, no embedded video. The hero, product page, and video section all have placeholder boxes. For a CISO evaluating whether to deploy a Chrome extension to their entire organisation, seeing the actual UI is non-negotiable. A single authentic screenshot of the extension blocking a ChatGPT prompt would do more conversion work than any copy change on this list.
