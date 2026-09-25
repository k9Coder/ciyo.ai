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
        margin: '16px 28px 0',
        background: 'var(--brand-soft)',
        borderRadius: 'var(--r)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}
    >
      <div>
        <div style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>
          Welcome to {orgName}, {firstName}!
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4, lineHeight: 1.45, maxWidth: 640 }}>
          Your administrator account is ready. To enable prompt protection on your own browser, you can now sign in to the Pretzel extension.
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        style={{
          background: 'var(--btn-bg)',
          color: 'var(--btn-fg)',
          border: 'none',
          borderRadius: 'var(--r-btn)',
          padding: '9px 18px',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Got it
      </button>
    </div>
  )
}
