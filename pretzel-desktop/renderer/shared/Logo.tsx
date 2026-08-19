/**
 * The Pretzel/mykka.ai mark — a glass orb rendered as an eye, with a scan
 * crosshair at its center. Same asset as pretzel/dist/logo-icon.svg, inlined
 * as a component (rather than a static asset) so it can be dropped into
 * either window at any size without a bundler asset-path headache.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="pretzel-orb" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#c8d8ff" />
          <stop offset="45%" stopColor="var(--brand-primary, #5b8cff)" />
          <stop offset="100%" stopColor="#1c3d9e" />
        </radialGradient>
        <radialGradient id="pretzel-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--brand-primary, #5b8cff)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--brand-primary, #5b8cff)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="56" height="56" rx="14" fill="var(--bg-surface, #10141f)" />
      <ellipse cx="28" cy="28" rx="22" ry="16" fill="url(#pretzel-halo)" />
      <path d="M9 28 Q28 12 47 28 Q28 44 9 28 Z" fill="url(#pretzel-orb)" />
      <path d="M9 28 Q28 12 47 28 Q28 44 9 28 Z" stroke="#eef3ff" strokeWidth="0.6" opacity="0.35" />
      <g stroke="var(--bg-surface, #10141f)" strokeWidth="1.3" strokeLinecap="round" opacity="0.55">
        <line x1="28" y1="21" x2="28" y2="24.6" />
        <line x1="28" y1="31.4" x2="28" y2="35" />
        <line x1="21" y1="28" x2="24.6" y2="28" />
        <line x1="31.4" y1="28" x2="35" y2="28" />
      </g>
    </svg>
  )
}
