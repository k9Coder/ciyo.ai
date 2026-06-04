export function PretzelLogo({ size = 28 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      borderRadius: Math.round(size * 0.25),
      background: 'var(--bg-base)',
      overflow: 'hidden',
    }}>
      <img src="/pretzel-logo.png" alt="Pretzel logo" width={size} height={size} style={{ display: 'block' }}/>
    </div>
  )
}
