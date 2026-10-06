import { useBilling, useBillingMutations } from '../../hooks/useBilling'

const PLAN_LABELS: Record<string, string> = {
  free:       'Free',
  starter:    'Starter',
  business:   'Business',
  enterprise: 'Enterprise',
  pilot:      'Pilot',
}

export function PlanBadge() {
  const { data } = useBilling()
  if (!data) return null
  const label = PLAN_LABELS[data.plan] ?? data.plan
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 500,
      color: 'var(--brand)', background: 'var(--brand-soft)',
      borderRadius: 'var(--r-btn)', padding: '2px 8px', lineHeight: 1.5,
    }}>
      {label}
    </span>
  )
}

/** Sits inside the sidebar organization card. */
export function PilotBanner() {
  const { data } = useBilling()
  if (!data || data.plan !== 'pilot') return null

  return (
    <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
      Pilot · all features
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
  const fg = isOverLimit ? 'var(--block)' : 'var(--warn)'
  const fill = isOverLimit ? 'var(--block-fill)' : 'var(--warn-fill)'

  return (
    <div style={{
      background: fill, borderRadius: 'var(--r-sm)', padding: 14,
      display: 'flex', flexDirection: 'column', gap: 9, flexShrink: 0,
    }}>
      <div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 600 }}>
        {isOverLimit ? 'Scan limit reached' : 'Approaching scan limit'}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.4 }}>
        {data.monthlyScans.toLocaleString()} / {data.scanLimit.toLocaleString()} scans used ({pct}%)
      </div>
      <div style={{ height: 6, background: 'var(--fill2)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: fg, transition: 'width 0.3s' }} />
      </div>
      {data.paymentProvider === 'stripe' && (
        <button
          onClick={() => openPortal.mutate(undefined)}
          disabled={openPortal.isPending}
          style={{
            padding: 9, fontSize: 14, fontWeight: 500,
            color: 'var(--btn-fg)', background: 'var(--btn-bg)', border: 'none',
            borderRadius: 'var(--r-btn)', cursor: 'pointer',
          }}
        >
          {openPortal.isPending ? 'Redirecting…' : 'Upgrade plan'}
        </button>
      )}
      {!data.paymentProvider && (
        <a
          href="https://mykka.ai/pricing"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 14, fontWeight: 600, color: fg, textDecoration: 'none' }}
        >
          Upgrade plan →
        </a>
      )}
    </div>
  )
}
