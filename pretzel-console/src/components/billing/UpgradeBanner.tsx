import { useBilling, useBillingMutations } from '../../hooks/useBilling'

const PLAN_LABELS: Record<string, string> = {
  free:       'Free',
  starter:    'Starter',
  business:   'Business',
  enterprise: 'Enterprise',
  pilot:      'Pilot',
}

const PLAN_COLORS: Record<string, string> = {
  free:       '#6b7280',
  starter:    '#3b82f6',
  business:   'var(--brand-primary)',
  enterprise: '#8b5cf6',
  pilot:      '#10b981',
}

export function PlanBadge() {
  const { data } = useBilling()
  if (!data) return null
  const label = PLAN_LABELS[data.plan] ?? data.plan
  const color = PLAN_COLORS[data.plan] ?? 'var(--brand-primary)'
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
      color, background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      borderRadius: 4, padding: '1px 5px', lineHeight: 1.6, textTransform: 'uppercase',
    }}>
      {label}
    </span>
  )
}

export function PilotBanner() {
  const { data } = useBilling()
  if (!data || data.plan !== 'pilot') return null

  return (
    <div style={{
      margin: '10px 10px 4px',
      background: 'color-mix(in srgb, #10b981 8%, var(--bg-surface-raised))',
      border: '1px solid color-mix(in srgb, #10b981 25%, transparent)',
      borderRadius: 8, padding: '8px 12px',
    }}>
      <div style={{ color: '#10b981', fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700 }}>
        Pilot Program
      </div>
      <div style={{ color: 'var(--text-primary)', fontSize: 11, marginTop: 3, fontWeight: 500 }}>
        All features free
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2, lineHeight: 1.4 }}>
        No credit card needed
      </div>
    </div>
  )
}

export function UpgradeBanner() {
  const { data } = useBilling()
  const { openPortal } = useBillingMutations()

  if (!data) return null
  if (data.plan !== 'free' && data.plan !== 'starter') return null

  const isNearLimit = data.scanLimit > 0 && data.monthlyScans / data.scanLimit >= 0.8
  const isOverLimit = data.scanBlocked

  if (!isNearLimit && !isOverLimit) return null

  const pct = data.scanLimit > 0 ? Math.min(100, Math.round((data.monthlyScans / data.scanLimit) * 100)) : 0
  const color = isOverLimit ? '#ef4444' : '#f59e0b'

  return (
    <div style={{
      margin: '10px 10px 4px',
      background: `color-mix(in srgb, ${color} 8%, var(--bg-surface-raised))`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      borderRadius: 8, padding: '8px 12px',
    }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>
        {isOverLimit ? 'Scan limit reached' : 'Approaching scan limit'}
      </div>
      <div style={{ color: 'var(--text-primary)', fontSize: 11, marginTop: 3 }}>
        {data.monthlyScans.toLocaleString()} / {data.scanLimit.toLocaleString()} scans used ({pct}%)
      </div>
      <div style={{ marginTop: 6, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      {data.paymentProvider === 'stripe' && (
        <button
          onClick={() => openPortal.mutate(undefined)}
          disabled={openPortal.isPending}
          style={{
            marginTop: 8, width: '100%', padding: '5px 0', fontSize: 11, fontWeight: 600,
            color, background: `color-mix(in srgb, ${color} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
            borderRadius: 5, cursor: 'pointer',
          }}
        >
          {openPortal.isPending ? 'Redirecting…' : 'Upgrade plan'}
        </button>
      )}
      {!data.paymentProvider && (
        <a
          href="https://ciyo.ai/pricing"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'block', marginTop: 8, textAlign: 'center',
            padding: '5px 0', fontSize: 11, fontWeight: 600,
            color, textDecoration: 'none',
          }}
        >
          Upgrade plan →
        </a>
      )}
    </div>
  )
}
