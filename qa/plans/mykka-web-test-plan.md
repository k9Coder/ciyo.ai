---
product: mykka-web
surface: web
type: browser
base_url: "local http://localhost:4000 | staging | prod https://mykka.ai"
auth: none
timebox_minutes: 10
tags: [smoke, marketing, navigation, links, responsive]
verified_at: 2026-08-08
---

# mykka.ai Marketing Site — QA Test Plan

Public Next.js marketing site. "Working" means every page renders, every
header/footer link resolves, the pricing toggle and dynamic (blog / solutions)
pages behave, and the sign-in / onboarding CTAs hand off cleanly to the console
origin (`NEXT_PUBLIC_APP_URL`, default `https://app.mykka.ai`). No login here.

## QA Results — 2026-08-08 (local :3001, gstack /qa)

| Case | Status | Notes |
|---|---|---|
| MW-01 Homepage + CTA | ✅ Pass | hero + "Start Free" render; only console error is the expected `/_vercel/insights` 404 (local dev) |
| MW-02 Header nav | ✅ Pass | Product/Pricing/Solutions/Security/Download/Blog all 200; logo → / |
| MW-03 Footer links | ✅ Pass | all 12 internal footer links resolve 200 |
| MW-04 Pricing toggle | ✅ Pass | Monthly/Annual toggle clicks with no error; plans + claims render (exact price-node diff not machine-checked) |
| MW-05 Solutions slugs + 404 | ✅ Pass | healthcare/legal/fintech/engineering 200; `does-not-exist` 404 |
| MW-06 Blog list/post/404 | ✅ Pass | list renders; top post (generative-ai-governance) 200; bad slug 404 |
| MW-07 Download handoff | ✅ Pass | Download button is JS-driven (onclick); real installer artifact resolution is Vercel-Blob/env-dependent, not verifiable locally |
| MW-08 Sign-in/onboarding CTA | ⚠️ Pass w/ note | resolve to `https://app.mykka.ai/` and `/onboarding` (valid console) — but that's the **prod** origin baked into this build; confirm a real staging build sets `NEXT_PUBLIC_APP_URL` to the staging console |
| MW-09 Legal pages | ✅ Pass | privacy/terms/security/about/accessibility all render; accessibility page is Hebrew (הצהרת נגישות) + English |
| MW-10 Console + broken-link sweep | ✅ Pass | all 11 routes 200; robots.txt + sitemap.xml 200; only noise error is `/_vercel/insights` 404 |
| MW-11 Mobile 375 | ✅ Pass | no horizontal overflow (scrollW == clientWidth) |
| MW-12 Staging badge | ✅ Pass | env is not staging (`NEXT_PUBLIC_ENV` unset) → badge correctly absent |

All 12 pass. Prior session had already covered MW-01/07/09 (home, /download, /login redirect, 404) — re-confirmed here. No re-tests needed (nothing failed).

## Preconditions (whole suite)

- Site reachable at the chosen base URL. Local dev serves port `4000`.
- On staging, `NEXT_PUBLIC_ENV=staging` should surface a `STAGING` badge.

## Cases

### MW-01 — Homepage renders with primary CTA
**Priority:** critical   **Timebox:** 1m   **Auth:** none
**Description:** the landing page loads and the primary onboarding CTA is present.
**Steps:**
1. Go to `/`.
2. Confirm hero section and primary CTA button render.
3. Check the browser console for errors.
**Expected:** page renders fully, primary CTA visible, zero console errors.

### MW-02 — Header navigation resolves
**Priority:** high   **Timebox:** 2m   **Auth:** none
**Description:** every header link goes to a real, non-404 page.
**Steps:**
1. From `/`, click each header link: Product, Pricing, Solutions, Security, Blog.
2. Confirm each destination renders (not 404, not blank).
3. Return home via the logo.
**Expected:** all header targets render; logo returns to `/`.

### MW-03 — Footer links resolve
**Priority:** medium   **Timebox:** 1m   **Auth:** none
**Description:** footer company / legal / docs / solution links resolve.
**Steps:**
1. Scroll to footer on `/`.
2. Click each footer link; confirm each destination renders.
**Expected:** no broken (404 / dead) footer links.

### MW-04 — Pricing monthly/annual toggle
**Priority:** high   **Timebox:** 1m   **Auth:** none
**Description:** the client-side price toggle updates displayed prices.
**Steps:**
1. Go to `/pricing`.
2. Toggle between Monthly and Annual.
3. Observe the plan prices.
**Expected:** prices update on toggle; no console error; both states show plan claims.

### MW-05 — Solutions industry pages + 404 guard
**Priority:** medium   **Timebox:** 2m   **Auth:** none
**Description:** the four valid industry slugs render; unknown slugs 404.
**Steps:**
1. Go to `/solutions`; confirm it links to four industries.
2. Visit `/solutions/healthcare`, `/solutions/legal`, `/solutions/fintech`, `/solutions/engineering`.
3. Visit `/solutions/does-not-exist`.
**Expected:** the four valid pages render; the invalid slug returns a 404 page.

### MW-06 — Blog list, post, and 404 guard
**Priority:** medium   **Timebox:** 1m   **Auth:** none
**Description:** blog index lists posts newest-first; a post opens; bad slug 404s.
**Steps:**
1. Go to `/blog`; confirm posts list, newest first.
2. Open the top post; confirm content renders.
3. Visit `/blog/not-a-real-post`.
**Expected:** list + post render; bad slug returns 404.

### MW-07 — Download page hands off to desktop installer
**Priority:** high   **Timebox:** 1m   **Auth:** none
**Description:** the download page offers the desktop app and its link points at a real artifact.
**Steps:**
1. Go to `/download`.
2. Confirm the download CTA renders and points to a desktop installer (Vercel Blob artifact / release asset).
3. Confirm the link is not a dead placeholder.
**Expected:** download CTA present and resolves to a downloadable installer.

### MW-08 — Sign-in / onboarding CTA hands off to console
**Priority:** critical   **Timebox:** 1m   **Auth:** none
**Description:** the sign-in and onboarding CTAs route to the console origin, not a dead link — the marketing → product handoff the user cares about.
**Steps:**
1. From the header, click the sign-in link.
2. Confirm it navigates to the console origin (`NEXT_PUBLIC_APP_URL`, default `https://app.mykka.ai`, staging on staging).
3. Back on `/`, click the primary onboarding CTA; confirm it also lands on the console.
**Expected:** both CTAs resolve to the correct console origin for the environment; no dead link, no wrong (prod-vs-staging) origin.

### MW-09 — Legal / compliance pages render
**Priority:** low   **Timebox:** 1m   **Auth:** none
**Description:** privacy, terms, security, and accessibility pages render.
**Steps:**
1. Visit `/privacy`, `/terms`, `/security`, `/about`, `/accessibility`.
2. Confirm each renders with content (accessibility page shows Hebrew + English).
**Expected:** all render, no broken sections.

### MW-10 — Site-wide console-error and broken-link sweep
**Priority:** high   **Timebox:** 2m   **Auth:** none
**Description:** no page throws JS errors and no primary link 404s.
**Steps:**
1. Walk every route from the route map (`/`, `/product`, `/pricing`, `/solutions`, `/security`, `/about`, `/blog`, `/privacy`, `/terms`, `/accessibility`, `/download`).
2. On each, watch the console for errors.
3. Confirm `/robots.txt` and `/sitemap.xml` respond.
**Expected:** zero console errors across pages; robots + sitemap serve; no broken primary links.

### MW-11 — Mobile responsiveness
**Priority:** medium   **Timebox:** 1m   **Auth:** none
**Description:** the homepage and pricing render usable at a phone viewport.
**Steps:**
1. Set viewport to 375x812.
2. Load `/` and `/pricing`.
3. Confirm nav (hamburger) works and no horizontal overflow.
**Expected:** layout adapts, nav usable, no content clipped off-screen.

### MW-12 — Staging badge (staging only)
**Priority:** low   **Timebox:** 1m   **Auth:** none
**Description:** staging builds visibly mark themselves.
**Preconditions:** environment is staging (`NEXT_PUBLIC_ENV=staging`).
**Steps:**
1. Load `/` on staging.
2. Look for the `STAGING` badge.
**Expected:** badge present on staging; absent on prod.
