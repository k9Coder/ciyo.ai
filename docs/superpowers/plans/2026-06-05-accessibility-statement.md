# Accessibility Statement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a legally-required Israeli accessibility statement ("הצהרת נגישות לנכים באתר") to both the ciyo-web marketing site and the pretzel-console admin app.

**Architecture:** Each app gets a dedicated `/accessibility` page containing the Hebrew + English statement, plus a footer link pointing to it. No backend changes needed — static content only.

**Tech Stack:** ciyo-web (Next.js App Router, Tailwind CSS), pretzel-console (React SPA, React Router, inline styles)

---

## File Map

| Action | File |
|---|---|
| Create | `ciyo-web/app/accessibility/page.tsx` |
| Modify | `ciyo-web/components/layout/Footer.tsx` |
| Modify | `ciyo-web/app/sitemap.ts` |
| Create | `pretzel-console/src/pages/AccessibilityPage.tsx` |
| Modify | `pretzel-console/src/App.tsx` |
| Modify | `pretzel-console/src/components/layout/AppLayout.tsx` |

---

## Task 1: ciyo-web — Accessibility page

**Files:**
- Create: `ciyo-web/app/accessibility/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// ciyo-web/app/accessibility/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'הצהרת נגישות | Accessibility Statement',
  description: 'הצהרת נגישות לנכים באתר ciyo.ai',
}

export default function AccessibilityPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20 text-[#94a3b8]">
      {/* Hebrew section */}
      <div dir="rtl" lang="he" className="mb-16">
        <h1 className="mb-2 text-3xl font-bold text-white">הצהרת נגישות</h1>
        <p className="mb-8 text-sm text-[#64748b]">עודכן לאחרונה: יוני 2026</p>

        <p className="mb-6 leading-relaxed">
          <strong className="text-white">ciyo.ai</strong> מחויבת לנגישות דיגיטלית לאנשים עם מוגבלות.
          אנו פועלים לשיפור מתמיד של חוויית המשתמש עבור כלל האוכלוסייה,
          ומיישמים את תקני הנגישות הרלוונטיים.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">רמת ציות</h2>
        <p className="mb-4 leading-relaxed">
          אתר זה שואף לעמוד בדרישות הנחיות{' '}
          <abbr title="Web Content Accessibility Guidelines">WCAG</abbr> 2.1 ברמה AA,
          בהתאם לתקן הישראלי 5568 ותקנות שוויון זכויות לאנשים עם מוגבלות
          (התאמות נגישות לשירות), התשע&quot;ג-2013.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">מה מונגש באתר</h2>
        <ul className="mb-4 list-inside list-disc space-y-2 leading-relaxed">
          <li>ניווט מלא באמצעות מקלדת בלבד</li>
          <li>תמיכה בתוכנות קורא מסך (JAWS, NVDA, VoiceOver)</li>
          <li>יחסי ניגודיות עומדים בדרישות WCAG 2.1 AA</li>
          <li>טקסט חלופי לתמונות ואייקונים</li>
          <li>כותרות מובנות היררכית לניווט קל</li>
          <li>הודעות שגיאה ברורות ומוקדות</li>
        </ul>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">מגבלות ידועות</h2>
        <ul className="mb-4 list-inside list-disc space-y-2 leading-relaxed">
          <li>תכנים שמוטמעים מצד שלישי (סרטוני YouTube, וידג&apos;טים חיצוניים) עשויים שלא לעמוד במלוא הדרישות</li>
          <li>אנו עובדים על שיפור נגישות פורטל הניהול (console.ciyo.ai) באופן שוטף</li>
        </ul>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">יצירת קשר בנושא נגישות</h2>
        <p className="mb-4 leading-relaxed">
          נתקלתם בבעיית נגישות או זקוקים לסיוע? פנו אלינו ונשתדל לתת מענה תוך 5 ימי עסקים:
        </p>
        <ul className="mb-4 list-inside list-disc space-y-2 leading-relaxed">
          <li>
            <strong className="text-white">אימייל: </strong>
            <a href="mailto:accessibility@ciyo.ai" className="underline hover:text-white">
              accessibility@ciyo.ai
            </a>
          </li>
        </ul>
      </div>

      {/* Divider */}
      <hr className="mb-16 border-white/[0.06]" />

      {/* English section */}
      <div lang="en">
        <h2 className="mb-2 text-2xl font-bold text-white">Accessibility Statement</h2>
        <p className="mb-8 text-sm text-[#64748b]">Last updated: June 2026</p>

        <p className="mb-6 leading-relaxed">
          <strong className="text-white">ciyo.ai</strong> is committed to digital accessibility for people with disabilities.
          We continually improve the user experience for everyone and apply relevant accessibility standards.
        </p>

        <h3 className="mb-3 mt-6 text-base font-semibold text-white">Conformance Status</h3>
        <p className="mb-4 leading-relaxed">
          This site aims to conform to WCAG 2.1 Level AA and Israeli Standard 5568.
        </p>

        <h3 className="mb-3 mt-6 text-base font-semibold text-white">Known Limitations</h3>
        <p className="mb-4 leading-relaxed">
          Third-party embedded content may not fully conform. We are actively working to address these gaps.
        </p>

        <h3 className="mb-3 mt-6 text-base font-semibold text-white">Contact</h3>
        <p className="leading-relaxed">
          Report accessibility issues to{' '}
          <a href="mailto:accessibility@ciyo.ai" className="underline hover:text-white">
            accessibility@ciyo.ai
          </a>
          . We respond within 5 business days.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify page renders (no build error)**

```bash
# in ciyo-web/
pnpm dev
# navigate to http://localhost:3000/accessibility
# expect: page loads, Hebrew text visible, RTL layout correct
```

- [ ] **Step 3: Commit**

```bash
git add ciyo-web/app/accessibility/page.tsx
git commit -m "feat(ciyo-web): add accessibility statement page (/accessibility)"
```

---

## Task 2: ciyo-web — Footer link + sitemap

**Files:**
- Modify: `ciyo-web/components/layout/Footer.tsx`
- Modify: `ciyo-web/app/sitemap.ts`

- [ ] **Step 1: Add link to Footer**

In `ciyo-web/components/layout/Footer.tsx`, the bottom bar currently has:

```tsx
<div className="flex gap-6">
  <Link href="/privacy" className="hover:text-[#94a3b8]">Privacy</Link>
  <Link href="/terms" className="hover:text-[#94a3b8]">Terms</Link>
</div>
```

Replace with:

```tsx
<div className="flex gap-6">
  <Link href="/privacy" className="hover:text-[#94a3b8]">Privacy</Link>
  <Link href="/terms" className="hover:text-[#94a3b8]">Terms</Link>
  <Link href="/accessibility" className="hover:text-[#94a3b8]">נגישות</Link>
</div>
```

- [ ] **Step 2: Add to sitemap**

In `ciyo-web/app/sitemap.ts`, add `/accessibility` to `staticRoutes`:

```ts
const staticRoutes = [
  '/', '/product', '/pricing', '/solutions',
  '/solutions/healthcare', '/solutions/legal', '/solutions/fintech', '/solutions/engineering',
  '/security', '/about', '/blog', '/accessibility',
]
```

- [ ] **Step 3: Verify in browser**

```bash
# in ciyo-web/
pnpm dev
# check footer on http://localhost:3000 — "נגישות" link visible
# click it — lands on /accessibility page
```

- [ ] **Step 4: Commit**

```bash
git add ciyo-web/components/layout/Footer.tsx ciyo-web/app/sitemap.ts
git commit -m "feat(ciyo-web): link accessibility page from footer + sitemap"
```

---

## Task 3: pretzel-console — Accessibility page

**Files:**
- Create: `pretzel-console/src/pages/AccessibilityPage.tsx`

- [ ] **Step 1: Create the page**

```tsx
// pretzel-console/src/pages/AccessibilityPage.tsx
export function AccessibilityPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 32px', color: 'var(--text-secondary, #94a3b8)', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Hebrew */}
      <div dir="rtl" lang="he" style={{ marginBottom: 64 }}>
        <h1 style={{ color: 'var(--text-primary, #fff)', fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          הצהרת נגישות
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginBottom: 32 }}>
          עודכן לאחרונה: יוני 2026
        </p>

        <p style={{ lineHeight: 1.7, marginBottom: 24 }}>
          <strong style={{ color: 'var(--text-primary, #fff)' }}>Pretzel by ciyo.ai</strong> מחויבת לנגישות דיגיטלית לאנשים עם מוגבלות.
          אנו פועלים לשיפור מתמיד של חוויית המשתמש עבור כלל האוכלוסייה,
          ומיישמים את תקני הנגישות הרלוונטיים.
        </p>

        <h2 style={{ color: 'var(--text-primary, #fff)', fontSize: 16, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>
          רמת ציות
        </h2>
        <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
          אתר זה שואף לעמוד בדרישות הנחיות WCAG 2.1 ברמה AA,
          בהתאם לתקן הישראלי 5568 ותקנות שוויון זכויות לאנשים עם מוגבלות
          (התאמות נגישות לשירות), התשע"ג-2013.
        </p>

        <h2 style={{ color: 'var(--text-primary, #fff)', fontSize: 16, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>
          מה מונגש באתר
        </h2>
        <ul style={{ lineHeight: 1.8, paddingRight: 20, marginBottom: 16 }}>
          <li>ניווט מלא באמצעות מקלדת בלבד</li>
          <li>תמיכה בתוכנות קורא מסך (JAWS, NVDA, VoiceOver)</li>
          <li>יחסי ניגודיות עומדים בדרישות</li>
          <li>טקסט חלופי לתמונות ואייקונים</li>
          <li>הודעות שגיאה ברורות ומוקדות</li>
        </ul>

        <h2 style={{ color: 'var(--text-primary, #fff)', fontSize: 16, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>
          מגבלות ידועות
        </h2>
        <ul style={{ lineHeight: 1.8, paddingRight: 20, marginBottom: 16 }}>
          <li>תכנים שמוטמעים מצד שלישי עשויים שלא לעמוד במלוא הדרישות</li>
          <li>אנו עובדים על שיפורי נגישות באופן שוטף</li>
        </ul>

        <h2 style={{ color: 'var(--text-primary, #fff)', fontSize: 16, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>
          יצירת קשר בנושא נגישות
        </h2>
        <p style={{ lineHeight: 1.7, marginBottom: 8 }}>
          נתקלתם בבעיית נגישות? פנו אלינו ונשתדל לתת מענה תוך 5 ימי עסקים:
        </p>
        <p>
          <strong style={{ color: 'var(--text-primary, #fff)' }}>אימייל: </strong>
          <a href="mailto:accessibility@ciyo.ai" style={{ color: 'var(--brand-primary, #6366f1)', textDecoration: 'underline' }}>
            accessibility@ciyo.ai
          </a>
        </p>
      </div>

      {/* Divider */}
      <hr style={{ borderColor: 'var(--border, rgba(255,255,255,0.06))', marginBottom: 48 }} />

      {/* English */}
      <div lang="en">
        <h2 style={{ color: 'var(--text-primary, #fff)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          Accessibility Statement
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginBottom: 32 }}>
          Last updated: June 2026
        </p>

        <p style={{ lineHeight: 1.7, marginBottom: 24 }}>
          <strong style={{ color: 'var(--text-primary, #fff)' }}>Pretzel by ciyo.ai</strong> is committed to digital
          accessibility for people with disabilities. We continually improve the user experience for everyone.
        </p>

        <h3 style={{ color: 'var(--text-primary, #fff)', fontSize: 14, fontWeight: 600, marginTop: 24, marginBottom: 10 }}>
          Conformance Status
        </h3>
        <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
          This application aims to conform to WCAG 2.1 Level AA and Israeli Standard 5568.
        </p>

        <h3 style={{ color: 'var(--text-primary, #fff)', fontSize: 14, fontWeight: 600, marginTop: 24, marginBottom: 10 }}>
          Known Limitations
        </h3>
        <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
          Third-party embedded content may not fully conform. We actively work to address these gaps.
        </p>

        <h3 style={{ color: 'var(--text-primary, #fff)', fontSize: 14, fontWeight: 600, marginTop: 24, marginBottom: 10 }}>
          Contact
        </h3>
        <p style={{ lineHeight: 1.7 }}>
          Report accessibility issues to{' '}
          <a href="mailto:accessibility@ciyo.ai" style={{ color: 'var(--brand-primary, #6366f1)', textDecoration: 'underline' }}>
            accessibility@ciyo.ai
          </a>
          . We respond within 5 business days.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add pretzel-console/src/pages/AccessibilityPage.tsx
git commit -m "feat(pretzel-console): add AccessibilityPage component"
```

---

## Task 4: pretzel-console — Route + footer link

**Files:**
- Modify: `pretzel-console/src/App.tsx`
- Modify: `pretzel-console/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Add route in App.tsx**

In `pretzel-console/src/App.tsx`, add the import at the top with the other imports:

```tsx
import { AccessibilityPage } from './pages/AccessibilityPage'
```

Then add the route inside `<Routes>` alongside the other public routes (`/login`, `/unauthorized`, etc.) — **before** the `RequireAuth` block:

```tsx
<Route path="/accessibility" element={<AccessibilityPage />} />
```

Full `<Routes>` block after change:

```tsx
<Routes>
  <Route path="/login"          element={<LoginPage />} />
  <Route path="/unauthorized"   element={<UnauthorizedPage />} />
  <Route path="/onboarding"     element={<OnboardingPage />} />
  <Route path="/invite/:token"  element={<InvitePage />} />
  <Route path="/accessibility"  element={<AccessibilityPage />} />
  <Route
    element={
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    }
  >
    <Route index element={<Navigate to="/dashboard" replace />} />
    <Route path="/dashboard"    element={<DashboardPage />} />
    <Route path="/subjects"     element={<SubjectsPage />} />
    <Route path="/org"          element={<OrgPage />} />
    <Route path="/destinations" element={<DestinationsPage />} />
    <Route path="/sites"        element={<SitesPage />} />
    <Route path="/publish"      element={<PublishPage />} />
    <Route path="/settings"     element={<SettingsPage />} />
    <Route path="/members"      element={<MembersPage />} />
    <Route path="/audit"        element={<AuditLogPage />} />
    <Route path="/assistant"    element={<PlanGate feature="assistantEnabled"><AssistantPage /></PlanGate>} />
  </Route>
</Routes>
```

- [ ] **Step 2: Add footer link in AppLayout.tsx**

In `pretzel-console/src/components/layout/AppLayout.tsx`, the footer `<div>` currently ends with:

```tsx
<a href="https://ciyo.ai" target="_blank" rel="noreferrer"
  style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none' }}>
  ciyo.ai
</a>
```

Replace with:

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
  <Link to="/accessibility"
    style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none' }}>
    נגישות
  </Link>
  <a href="https://ciyo.ai" target="_blank" rel="noreferrer"
    style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none' }}>
    ciyo.ai
  </a>
</div>
```

`Link` is already imported from `react-router-dom` at line 1 — no new import needed.

- [ ] **Step 3: Verify in browser**

```bash
# in pretzel-console/
pnpm dev
# navigate to http://localhost:5173/accessibility (no login required)
# expect: page loads with Hebrew + English statement
# check AppLayout footer — "נגישות" link visible, clicking navigates to /accessibility
```

- [ ] **Step 4: Commit**

```bash
git add pretzel-console/src/App.tsx pretzel-console/src/components/layout/AppLayout.tsx
git commit -m "feat(pretzel-console): add /accessibility route + footer link"
```

---

## Self-Review

**Spec coverage:**
- ✅ Hebrew accessibility statement — both apps
- ✅ English accessibility statement — both apps
- ✅ Footer link in ciyo-web
- ✅ Footer link in pretzel-console
- ✅ Route accessible without auth in pretzel-console
- ✅ Sitemap entry in ciyo-web
- ✅ Contact method (accessibility@ciyo.ai)
- ✅ Conformance level stated (WCAG 2.1 AA + IS 5568)
- ✅ Last-updated date
- ✅ Known limitations section

**Placeholder scan:** No TBDs, no "implement later", all code is complete.

**Type consistency:** No shared types introduced — plain JSX throughout.
