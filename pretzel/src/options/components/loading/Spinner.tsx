import "./loading.css";

type SpinnerSize = "sm" | "md" | "lg";

const SIZES: Record<SpinnerSize, { svg: number; stroke: number; track: number }> = {
  sm: { svg: 16, stroke: 2,   track: 1.5 },
  md: { svg: 24, stroke: 2.5, track: 2   },
  lg: { svg: 40, stroke: 3,   track: 2.5 },
};

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  const { svg: s, stroke, track } = SIZES[size];
  const r = (s - stroke * 2) / 2;
  const cx = s / 2;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * 0.72;
  const gap = circumference - arc;
  const primary = "var(--brand-primary, #00d4ff)";

  return (
    <span className={`mykka-spinner ${className}`} role="status" aria-label="Loading">
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
        <circle cx={cx} cy={cx} r={r} stroke={primary} strokeOpacity="0.15" strokeWidth={track} />
        <circle
          cx={cx} cy={cx} r={r}
          stroke={primary}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${gap}`}
          style={{ filter: `drop-shadow(0 0 3px ${primary})` }}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </svg>
    </span>
  );
}

/** Centered loading placeholder — drop it in place of content, no wrapper needed */
export function InlineLoader({ size = "md" }: { size?: SpinnerSize }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "20px 0" }}>
      <Spinner size={size} />
    </div>
  );
}

/** Full-page loading state — spinner only, optional context label in mykka style */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="mykka-page-loading">
      <Spinner size="lg" />
      {label && <span className="mykka-label">{label}</span>}
    </div>
  );
}
