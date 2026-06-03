export function PretzelLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-label="Pretzel logo">
      <defs>
        <mask id="pretzel-logo-bite">
          <rect width="56" height="56" fill="white"/>
          <ellipse cx="46" cy="12" rx="11" ry="9" fill="black"/>
        </mask>
      </defs>

      <rect width="56" height="56" rx="14" fill="var(--bg-base)" />

      <g mask="url(#pretzel-logo-bite)">
        {/*
          Filled pretzel body using even-odd: outer shield shape minus two oval windows.
          The crossing arms between the windows are naturally filled (part of the shield).
        */}
        <path
          fillRule="evenodd"
          fill="#A0522D"
          d={[
            // Outer body — rounded shield, wide arch at top, tapers to notch at bottom-center
            'M9 26 C9 14 17 8 28 8 C39 8 47 14 47 26 C47 38 41 46 34 46 C31 46 29 44 28 41 C27 44 25 46 22 46 C15 46 9 38 9 26 Z',
            // Left window
            'M15 27 C15 20 18 15 21 15 C24 15 26 18 26 24 C26 31 24 36 21 36 C18 36 15 32 15 27 Z',
            // Right window
            'M30 24 C30 18 32 15 35 15 C38 15 41 19 41 25 C41 32 38 36 35 36 C32 36 30 32 30 24 Z',
          ].join(' ')}
        />

        {/* Bottom tails */}
        <line x1="22" y1="46" x2="18" y2="53" stroke="#A0522D" strokeWidth="5" strokeLinecap="round"/>
        <line x1="34" y1="46" x2="38" y2="53" stroke="#A0522D" strokeWidth="5" strokeLinecap="round"/>

        {/* Salt crystals on the dough surface */}
        <circle cx="13" cy="22" r="2.2" fill="rgba(255,255,255,0.88)"/>
        <circle cx="23" cy="11" r="1.8" fill="rgba(255,255,255,0.82)"/>
        <circle cx="28" cy="21" r="1.7" fill="rgba(255,255,255,0.78)"/>
        <circle cx="11" cy="34" r="1.6" fill="rgba(255,255,255,0.72)"/>
      </g>

      {/* Crumbs scattered from the bite */}
      <circle cx="50" cy="9"  r="1.5" fill="#A0522D" opacity="0.85"/>
      <circle cx="53" cy="15" r="1.2" fill="#A0522D" opacity="0.65"/>
      <circle cx="47" cy="5"  r="1.0" fill="#A0522D" opacity="0.5"/>
    </svg>
  )
}
