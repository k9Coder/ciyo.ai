import { useClerk } from '@clerk/react'

export function UnauthorizedPage() {
  const { signOut } = useClerk()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ width: 64, height: 64, background: 'rgba(224,48,80,0.12)', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <span style={{ color: 'var(--status-danger)', fontSize: 24 }}>⊘</span>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>Access denied</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
          Your account doesn't have admin permissions for this organization.
          Contact your organization owner to get access.
        </p>
        <button
          onClick={() => signOut()}
          style={{ fontSize: 13, color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
