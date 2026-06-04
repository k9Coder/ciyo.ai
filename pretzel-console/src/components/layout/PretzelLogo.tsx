export function PretzelLogo({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/pretzel-logo.png"
      alt="Pretzel logo"
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
    />
  )
}
