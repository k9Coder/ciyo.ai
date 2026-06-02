export function PretzelLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-label="Pretzel logo">
      <rect width="56" height="56" rx="14" fill="var(--bg-base)" />
      {/* Outer left loop */}
      <path d="M20 16 C14 16, 10 20, 10 26 C10 32, 14 36, 20 36"
            stroke="var(--brand-primary)" strokeWidth="3.5"
            strokeLinecap="round" fill="none" />
      {/* Outer right loop */}
      <path d="M36 16 C42 16, 46 20, 46 26 C46 32, 42 36, 36 36"
            stroke="var(--brand-primary)" strokeWidth="3.5"
            strokeLinecap="round" fill="none" />
      {/* Center cross */}
      <path d="M20 16 C24 10, 32 10, 36 16 M20 36 C24 42, 32 42, 36 36"
            stroke="var(--brand-primary)" strokeWidth="3.5"
            strokeLinecap="round" fill="none" />
      {/* Cross-over */}
      <path d="M22 28 L34 28 M28 22 L28 34"
            stroke="var(--brand-primary)" strokeWidth="2.5"
            strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}
