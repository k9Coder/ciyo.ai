import { useClerk } from '@clerk/react'

/**
 * Shown when a signed-in user reaches the console but isn't an admin of the
 * active org (role `member`). The console is an admin surface — members use the
 * desktop app / extension — so instead of dropping them into an app shell where
 * every admin call 403s, we send them here with a clear explanation and a way out.
 */
export function UnauthorizedPage() {
  const { signOut } = useClerk()

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base, #0f1117)', padding: '24px 16px',
    }}>
      <div style={{
        background: 'var(--bg-surface, #1a1d27)', border: '1px solid var(--border, #2a2d3a)',
        borderRadius: 16, padding: '40px 48px', maxWidth: 440, width: '100%',
        display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary, #e8eaf0)', margin: 0 }}>
          You don't have admin access
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted, #6b7280)', margin: 0, lineHeight: 1.55 }}>
          The Pretzel Console is for organization admins. Your account is a member of
          this organization, so there's nothing to manage here — protection runs in the
          Pretzel desktop app and browser extension. Ask an admin if you need console access.
        </p>
        <button
          type="button"
          onClick={() => void signOut({ redirectUrl: '/login' })}
          style={{
            marginTop: 6, background: 'var(--brand-primary, #6366f1)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
