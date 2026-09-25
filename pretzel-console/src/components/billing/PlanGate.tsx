import type { ReactNode } from 'react'
import { useBilling, useBillingMutations } from '../../hooks/useBilling'

interface PlanGateProps {
  feature: 'assistantEnabled' | 'advancedAnalytics'
  children: ReactNode
}

export function PlanGate({ feature, children }: PlanGateProps) {
  const { data, isLoading } = useBilling()
  const { openPortal } = useBillingMutations()

  if (isLoading) return null

  if (data?.features[feature]) return <>{children}</>

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 16, padding: 40, textAlign: 'center',
    }}>
      <div style={{ fontSize: 32 }}>✦</div>
      <div style={{ color: 'var(--ink)', fontSize: 20, fontWeight: 700 }}>
        Business plan required
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 15, maxWidth: 360, lineHeight: 1.6 }}>
        The AI Assistant is available on the Business plan. Upgrade to unlock intelligent policy suggestions and bulk apply.
      </div>
      {data?.paymentProvider === 'stripe' ? (
        <button
          onClick={() => openPortal.mutate(window.location.href)}
          disabled={openPortal.isPending}
          style={{
            marginTop: 8, padding: '10px 24px', fontSize: 15, fontWeight: 600,
            color: 'var(--btn-fg)', background: 'var(--btn-bg)',
            border: 'none', borderRadius: 'var(--r-btn)', cursor: 'pointer',
          }}
        >
          {openPortal.isPending ? 'Redirecting…' : 'Upgrade to Business'}
        </button>
      ) : (
        <a
          href="https://mykka.ai/pricing"
          target="_blank"
          rel="noreferrer"
          style={{
            marginTop: 8, padding: '10px 24px', fontSize: 15, fontWeight: 600,
            color: 'var(--btn-fg)', background: 'var(--btn-bg)',
            borderRadius: 'var(--r-sm)', textDecoration: 'none',
          }}
        >
          View plans →
        </a>
      )}
    </div>
  )
}
