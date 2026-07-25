import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth, useClerk } from '@clerk/react'
import { Spinner } from '../components/ui/Spinner'
import { API_BASE } from '../lib/api'

export function DesktopLoginPage() {
  const [params] = useSearchParams()
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { openSignIn } = useClerk()
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)

  const state = params.get('state')
  const codeChallenge = params.get('code_challenge')
  const redirectUri = params.get('redirect_uri')

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      openSignIn()
      return
    }
    if (!state || !codeChallenge || !redirectUri) {
      setError('Missing sign-in parameters — please retry from Pretzel Desktop.')
      return
    }

    let cancelled = false
    async function complete() {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/auth/desktop/authorize/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ state, code_challenge: codeChallenge, redirect_uri: redirectUri }),
      })
      if (cancelled) return
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Sign-in failed' })) as { error?: string }
        setError(body.error ?? 'Sign-in failed')
        return
      }
      const { redirectUrl } = await res.json() as { redirectUrl: string }
      setCompleted(true)
      window.location.href = redirectUrl
    }
    complete().catch(() => {
      if (!cancelled) setError('Sign-in failed — please retry from Pretzel Desktop.')
    })
    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, state, codeChallenge, redirectUri, getToken, openSignIn])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base, #0f1117)' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-primary, #e8eaf0)' }}>
        {error ? (
          <p style={{ color: 'var(--status-danger, #ef4444)' }}>{error}</p>
        ) : completed ? (
          <p>Signed in — you can close this tab and return to Pretzel Desktop.</p>
        ) : (
          <>
            <Spinner size="md" />
            <p style={{ marginTop: 16 }}>Signing you in…</p>
          </>
        )}
      </div>
    </div>
  )
}
