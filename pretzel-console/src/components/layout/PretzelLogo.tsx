/**
 * Logo 2a: rounded square with three bars (top, thick middle, short bottom).
 * Light theme: filled green. Dark theme: outlined with a mint middle bar.
 * Colors come from the --logo-* tokens so it follows the active theme without JS.
 */
export function PretzelLogo({ size = 26 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-label="Pretzel logo"
      style={{
        width: size, height: size, flexShrink: 0, position: 'relative', display: 'block',
        borderRadius: 'var(--logo-r)', background: 'var(--logo-bg)',
        border: 'var(--logo-bd) solid var(--ink)', boxSizing: 'border-box',
      }}
    >
      <span style={{ position: 'absolute', left: '20%', top: '24%', width: '60%', height: '9%', background: 'var(--logo-bar)' }} />
      <span style={{ position: 'absolute', left: '20%', top: '40%', width: '60%', height: '20%', background: 'var(--logo-mid)' }} />
      <span style={{ position: 'absolute', left: '20%', top: '67%', width: '36%', height: '9%', background: 'var(--logo-bar)' }} />
    </span>
  )
}
