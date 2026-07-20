import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'הצהרת נגישות | Accessibility Statement',
  description: 'הצהרת נגישות לנכים באתר mykka.ai',
}

export default function AccessibilityPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20 text-[#94a3b8]">
      {/* Hebrew */}
      <div dir="rtl" lang="he" className="mb-16">
        <h1 className="mb-2 text-3xl font-bold text-white">הצהרת נגישות</h1>
        <p className="mb-8 text-sm text-[#64748b]">עודכן לאחרונה: יוני 2026</p>

        <p className="mb-6 leading-relaxed">
          <strong className="text-white">mykka.ai</strong> מחויבת לנגישות דיגיטלית לאנשים עם מוגבלות.
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
          <li>אנו עובדים על שיפור נגישות פורטל הניהול (console.mykka.ai) באופן שוטף</li>
        </ul>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">יצירת קשר בנושא נגישות</h2>
        <p className="mb-4 leading-relaxed">
          נתקלתם בבעיית נגישות או זקוקים לסיוע? פנו אלינו ונשתדל לתת מענה תוך 5 ימי עסקים:
        </p>
        <ul className="mb-4 list-inside list-disc space-y-2 leading-relaxed">
          <li>
            <strong className="text-white">אימייל: </strong>
            <a href="mailto:accessibility@mykka.ai" className="underline hover:text-white">
              accessibility@mykka.ai
            </a>
          </li>
        </ul>
      </div>

      {/* Divider */}
      <hr className="mb-16 border-white/[0.06]" />

      {/* English */}
      <div lang="en">
        <h2 className="mb-2 text-2xl font-bold text-white">Accessibility Statement</h2>
        <p className="mb-8 text-sm text-[#64748b]">Last updated: June 2026</p>

        <p className="mb-6 leading-relaxed">
          <strong className="text-white">mykka.ai</strong> is committed to digital accessibility for people with disabilities.
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
          <a href="mailto:accessibility@mykka.ai" className="underline hover:text-white">
            accessibility@mykka.ai
          </a>
          . We respond within 5 business days.
        </p>
      </div>
    </main>
  )
}
