import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { useActiveOrg } from '../../hooks/useMemberships'

export function FirstTimeWelcomeBanner() {
  const { user } = useUser()
  const activeOrg = useActiveOrg()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (!user || !activeOrg) return
    // Only show for admin roles (super_admin or division_admin)
    if (activeOrg.role !== 'super_admin' && activeOrg.role !== 'division_admin') {
      return
    }
    const key = `pretzel_welcome_seen_${user.id}_${activeOrg.tenantId}`
    const seen = localStorage.getItem(key)
    if (!seen) {
      setDismissed(false)
    }
  }, [user, activeOrg])

  if (dismissed || !activeOrg || !user) return null

  if (activeOrg.role !== 'super_admin' && activeOrg.role !== 'division_admin') {
    return null
  }

  function handleDismiss() {
    if (user && activeOrg) {
      const key = `pretzel_welcome_seen_${user.id}_${activeOrg.tenantId}`
      localStorage.setItem(key, 'true')
    }
    setDismissed(true)
  }

  const firstName = user.firstName || user.fullName || 'there'
  const orgName = activeOrg.tenantName || 'your organization'

  return (
    <div
      role="region"
      aria-label="Welcome announcement"
      style={{
        margin: '16px 24px 0',
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 12%, var(--bg-surface-raised)), var(--bg-surface-raised))',
        border: '1px solid color-mix(in srgb, var(--brand-primary) 35%, var(--border))',
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'color-mix(in srgb, var(--brand-primary) 20%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          🎉
        </div>
        <div>
          <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
            Welcome to {orgName}, {firstName}!
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4, lineHeight: 1.45, maxWidth: 640 }}>
            Your administrator account is ready. To enable prompt protection on your own browser, you can now sign in to the Pretzel extension.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            background: 'var(--brand-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
