export function PretzelLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-label="Pretzel logo">
      <defs>
        {/* Bite taken from upper-right loop */}
        <mask id="pretzel-logo-bite">
          <rect width="56" height="56" fill="white"/>
          <circle cx="46" cy="14" r="10" fill="black"/>
        </mask>
      </defs>

      <rect width="56" height="56" rx="14" fill="var(--bg-base)" />

      <g mask="url(#pretzel-logo-bite)"
         stroke="var(--brand-primary)" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Left outer loop */}
        <path d="M21 17 C14 17, 9 21, 9 27 C9 33, 14 37, 21 37" strokeWidth="4"/>
        {/* Right outer loop */}
        <path d="M35 17 C42 17, 47 21, 47 27 C47 33, 42 37, 35 37" strokeWidth="4"/>
        {/* Top arch */}
        <path d="M21 17 C24 10, 32 10, 35 17" strokeWidth="4"/>
        {/* Bottom arch */}
        <path d="M21 37 C24 44, 32 44, 35 37" strokeWidth="4"/>
        {/* Center cross-over — diagonal arms like a real pretzel knot, not a + */}
        <path d="M22 21 C25 24, 30 30, 34 34" strokeWidth="3.5" opacity="0.75"/>
        <path d="M22 33 C25 30, 30 25, 34 21" strokeWidth="3.5" opacity="0.75"/>
      </g>

      {/* Crumbs scattered from the bite */}
      <circle cx="50" cy="10" r="1.2" fill="var(--brand-primary)" opacity="0.8"/>
      <circle cx="53" cy="16" r="1.0" fill="var(--brand-primary)" opacity="0.6"/>
      <circle cx="48" cy="7"  r="0.9" fill="var(--brand-primary)" opacity="0.5"/>
    </svg>
  )
}
