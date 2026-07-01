export function AccessibilityPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 32px', color: 'var(--text-secondary, #94a3b8)', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* English */}
      <div lang="en" style={{ marginBottom: 64 }}>
        <h1 style={{ color: 'var(--text-primary, #fff)', fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Accessibility Statement
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginBottom: 32 }}>
          Last updated: June 2026
        </p>

        <p style={{ lineHeight: 1.7, marginBottom: 24 }}>
          <strong style={{ color: 'var(--text-primary, #fff)' }}>Pretzel by ciyo.ai</strong> is committed to digital
          accessibility for people with disabilities. We continually improve the user experience for everyone.
        </p>

        <h2 style={{ color: 'var(--text-primary, #fff)', fontSize: 16, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>
          Conformance Status
        </h2>
        <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
          This application aims to conform to WCAG 2.1 Level AA and Israeli Standard 5568.
        </p>

        <h2 style={{ color: 'var(--text-primary, #fff)', fontSize: 16, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>
          Known Limitations
        </h2>
        <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
          Third-party embedded content may not fully conform. We actively work to address these gaps.
        </p>

        <h2 style={{ color: 'var(--text-primary, #fff)', fontSize: 16, fontWeight: 600, marginTop: 32, marginBottom: 12 }}>
          Contact
        </h2>
        <p style={{ lineHeight: 1.7 }}>
          Report accessibility issues to{' '}
          <a href="mailto:accessibility@ciyo.ai" style={{ color: 'var(--brand-primary, #6366f1)', textDecoration: 'underline' }}>
            accessibility@ciyo.ai
          </a>
          . We respond within 5 business days.
        </p>
      </div>

      {/* Divider */}
      <hr style={{ borderColor: 'var(--border, rgba(255,255,255,0.06))', marginBottom: 48 }} />

      {/* Hebrew — required by Israeli Standard 5568 */}
      <div dir="rtl" lang="he">
        <h2 style={{ color: 'var(--text-primary, #fff)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          הצהרת נגישות
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginBottom: 32 }}>
          עודכן לאחרונה: יוני 2026
        </p>

        <p style={{ lineHeight: 1.7, marginBottom: 24 }}>
          <strong style={{ color: 'var(--text-primary, #fff)' }}>Pretzel by ciyo.ai</strong> מחויבת לנגישות דיגיטלית לאנשים עם מוגבלות.
          אנו פועלים לשיפור מתמיד של חוויית המשתמש עבור כלל האוכלוסייה,
          ומיישמים את תקני הנגישות הרלוונטיים.
        </p>

        <h3 style={{ color: 'var(--text-primary, #fff)', fontSize: 14, fontWeight: 600, marginTop: 24, marginBottom: 10 }}>
          רמת ציות
        </h3>
        <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
          אתר זה שואף לעמוד בדרישות הנחיות WCAG 2.1 ברמה AA,
          בהתאם לתקן הישראלי 5568 ותקנות שוויון זכויות לאנשים עם מוגבלות
          (התאמות נגישות לשירות), התשע"ג-2013.
        </p>

        <h3 style={{ color: 'var(--text-primary, #fff)', fontSize: 14, fontWeight: 600, marginTop: 24, marginBottom: 10 }}>
          מה מונגש באתר
        </h3>
        <ul style={{ lineHeight: 1.8, paddingRight: 20, marginBottom: 16 }}>
          <li>ניווט מלא באמצעות מקלדת בלבד</li>
          <li>תמיכה בתוכנות קורא מסך (JAWS, NVDA, VoiceOver)</li>
          <li>יחסי ניגודיות עומדים בדרישות</li>
          <li>טקסט חלופי לתמונות ואייקונים</li>
          <li>הודעות שגיאה ברורות ומוקדות</li>
        </ul>

        <h3 style={{ color: 'var(--text-primary, #fff)', fontSize: 14, fontWeight: 600, marginTop: 24, marginBottom: 10 }}>
          מגבלות ידועות
        </h3>
        <ul style={{ lineHeight: 1.8, paddingRight: 20, marginBottom: 16 }}>
          <li>תכנים שמוטמעים מצד שלישי עשויים שלא לעמוד במלוא הדרישות</li>
          <li>אנו עובדים על שיפורי נגישות באופן שוטף</li>
        </ul>

        <h3 style={{ color: 'var(--text-primary, #fff)', fontSize: 14, fontWeight: 600, marginTop: 24, marginBottom: 10 }}>
          יצירת קשר בנושא נגישות
        </h3>
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
    </div>
  )
}
