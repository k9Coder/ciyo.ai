type BadgeVariant = 'keyword' | 'pattern' | 'entropy' | 'score' | 'warn' | 'block' | 'global' | 'division' | 'team'

const COLORS: Record<BadgeVariant, { bg: string; color: string }> = {
  keyword:  { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
  pattern:  { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
  entropy:  { bg: 'rgba(139,92,246,0.15)',  color: '#8b5cf6' },
  score:    { bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6' },
  warn:     { bg: 'rgba(234,179,8,0.15)',   color: '#eab308' },
  block:    { bg: 'rgba(239,68,68,0.2)',    color: '#dc2626' },
  global:   { bg: 'var(--bg-surface-raised)', color: 'var(--text-secondary)' },
  division: { bg: 'rgba(99,102,241,0.15)',  color: '#6366f1' },
  team:     { bg: 'rgba(20,184,166,0.15)',  color: '#14b8a6' },
}

interface Props {
  variant: BadgeVariant
  children: React.ReactNode
}

export function Badge({ variant, children }: Props) {
  const { bg, color } = COLORS[variant]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
      borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: bg, color,
    }}>
      {children}
    </span>
  )
}
