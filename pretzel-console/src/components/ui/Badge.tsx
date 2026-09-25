type BadgeVariant = 'keyword' | 'pattern' | 'entropy' | 'score' | 'warn' | 'block' | 'global' | 'division' | 'team'

// Two-tone pills built from the semantic tokens: block = terracotta, warn = amber,
// detection kinds and scopes use the neutral fill / brand-soft pair so they read as labels, not alerts.
const COLORS: Record<BadgeVariant, { bg: string; color: string }> = {
  keyword:  { bg: 'var(--warn-fill)',  color: 'var(--warn)' },
  pattern:  { bg: 'var(--block-fill)', color: 'var(--block)' },
  entropy:  { bg: 'var(--fill)',       color: 'var(--ink)' },
  score:    { bg: 'var(--fill)',       color: 'var(--ink)' },
  warn:     { bg: 'var(--warn-fill)',  color: 'var(--warn)' },
  block:    { bg: 'var(--block-fill)', color: 'var(--block)' },
  global:   { bg: 'var(--fill)',       color: 'var(--muted)' },
  division: { bg: 'var(--brand-soft)', color: 'var(--brand)' },
  team:     { bg: 'var(--brand-soft)', color: 'var(--brand)' },
}

interface Props {
  variant: BadgeVariant
  children: React.ReactNode
}

export function Badge({ variant, children }: Props) {
  const { bg, color } = COLORS[variant]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
      borderRadius: 'var(--r-btn)', fontSize: 13, fontWeight: 500,
      background: bg, color,
    }}>
      {children}
    </span>
  )
}
