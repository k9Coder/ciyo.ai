export function PretzelLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-label="Pretzel logo">
      <defs>
        {/* Bite taken from upper-right arch */}
        <mask id="pretzel-logo-bite">
          <rect width="56" height="56" fill="white"/>
          <ellipse cx="47" cy="10" rx="11" ry="9" fill="black"/>
        </mask>
      </defs>

      <rect width="56" height="56" rx="14" fill="var(--bg-base)" />

      <g mask="url(#pretzel-logo-bite)">
        {/* Filled pretzel body — outer shield shape minus two oval windows (even-odd) */}
        <path
          fillRule="evenodd"
          fill="#c8873a"
          d={[
            // Outer body: arch at top, tapers to a notch at bottom-center
            'M10 22 C10 10 18 7 28 7 C38 7 46 10 46 22 C46 35 40 43 34 43 C31 43 29 41 28 38 C27 41 25 43 22 43 C16 43 10 35 10 22 Z',
            // Left window
            'M15 24 C15 17 18 13 21 13 C24 13 26 17 26 23 C26 29 24 33 21 33 C18 33 15 29 15 24 Z',
            // Right window
            'M30 23 C30 17 32 13 35 13 C38 13 41 17 41 23 C41 29 38 33 35 33 C32 33 30 29 30 23 Z',
          ].join(' ')}
        />

        {/* Bottom tails */}
        <line x1="22" y1="43" x2="19" y2="50" stroke="#c8873a" strokeWidth="4.5" strokeLinecap="round"/>
        <line x1="34" y1="43" x2="37" y2="50" stroke="#c8873a" strokeWidth="4.5" strokeLinecap="round"/>
      </g>

      {/* Crumbs scattered from the bite */}
      <circle cx="50" cy="8"  r="1.5" fill="#c8873a" opacity="0.85"/>
      <circle cx="53" cy="14" r="1.2" fill="#c8873a" opacity="0.65"/>
      <circle cx="48" cy="4"  r="1.0" fill="#c8873a" opacity="0.5"/>
    </svg>
  )
}
