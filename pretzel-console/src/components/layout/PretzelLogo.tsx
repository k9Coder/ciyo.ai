export function PretzelLogo({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/pretzel-logo.png"
      alt="Pretzel logo"
      height={size}
      style={{ display: 'block', width: 'auto', flexShrink: 0 }}
    />
  )
}
