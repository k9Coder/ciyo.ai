import { useClerk, useUser } from '@clerk/react'

/**
 * Shown when a signed-in user reaches the console but isn't an admin of the
 * active org (role `member`). The console is an admin surface — members use the
 * desktop app / extension — so instead of dropping them into an app shell where
 * every admin call 403s, we welcome them and explain that their extension is active.
 */
export function UnauthorizedPage() {
  const { signOut } = useClerk()
  const { user } = useUser()

  function handleClose() {
    window.close()
  }

  const name = user?.firstName || user?.fullName

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base, #0f1117)', padding: '24px 16px',
    }}>
      <div style={{
        background: 'var(--bg-surface, #1a1d27)', border: '1px solid var(--border, #2a2d3a)',
        borderRadius: 16, padding: '40px 48px', maxWidth: 460, width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'color-mix(in srgb, var(--brand-primary, #6366f1) 15%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>
          🎉
        </div>

        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary, #e8eaf0)', margin: 0 }}>
            You're all set{name ? `, ${name}` : ''}!
          </h1>
          <div style={{
            display: 'inline-block', marginTop: 8,
            background: 'color-mix(in srgb, #10b981 12%, transparent)',
            border: '1px solid color-mix(in srgb, #10b981 30%, transparent)',
            color: '#10b981', fontSize: 11, fontWeight: 700,
            padding: '2px 8px', borderRadius: 4, letterSpacing: '0.5px', textTransform: 'uppercase',
          }}>
            Organization Member
          </div>
        </div>

        <p style={{ fontSize: 14, color: 'var(--text-muted, #6b7280)', margin: 0, lineHeight: 1.6 }}>
          Your account is connected. Protection runs automatically in your Pretzel browser extension and desktop app — you don't need to configure anything here.
        </p>

        <p style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)', margin: 0, lineHeight: 1.5, opacity: 0.8 }}>
          The Pretzel Console is for organization administrators to manage DLP policies and compliance settings.
        </p>

        <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleClose}
            style={{
              width: '100%', background: 'var(--brand-primary, #6366f1)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
          >
            Close tab & return to browser
          </button>

          <button
            type="button"
            onClick={() => void signOut({ redirectUrl: '/login' })}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted, #6b7280)',
              fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 4,
            }}
          >
            Sign in with a different account
          </button>
        </div>
      </div>
    </div>
  )
}

