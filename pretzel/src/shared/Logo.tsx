/**
 * Pretzel mark (logo 2a): rounded square with three bars. Colors come from the
 * --logo-* tokens so it follows the light/dark theme of whichever surface
 * (popup, options page, or the overlay's shadow root) renders it.
 */
export function Logo({ size = 24, title = "Pretzel" }: { size?: number; title?: string }) {
  const bar = (top: string, height: string, width: string, color: string) => (
    <span
      style={{
        position: "absolute", left: "20%", top, width, height, background: color,
      }}
    />
  );
  return (
    <span
      role="img"
      aria-label={title}
      style={{
        position: "relative", display: "inline-block", flexShrink: 0,
        width: size, height: size, boxSizing: "border-box",
        borderRadius: size >= 24 ? "var(--logo-r, 6px)" : "calc(var(--logo-r, 6px) - 2px)",
        background: "var(--logo-bg, #1f6b4f)",
        border: "var(--logo-bd, 0px) solid var(--text-primary, #18201c)",
      }}
    >
      {bar("24%", "9%", "60%", "var(--logo-bar, #f6f7f5)")}
      {bar("40%", "20%", "60%", "var(--logo-mid, #f6f7f5)")}
      {bar("67%", "9%", "36%", "var(--logo-bar, #f6f7f5)")}
    </span>
  );
}
