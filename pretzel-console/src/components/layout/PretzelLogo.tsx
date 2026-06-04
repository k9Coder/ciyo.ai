export function PretzelLogo({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/pretzel-logo.png"
      alt="Pretzel logo"
      style={{ display: 'block', height: size, width: 'auto', flexShrink: 0 }}
    />
  )
}
