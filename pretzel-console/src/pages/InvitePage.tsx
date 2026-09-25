import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { setSelectedTenantId } from '../lib/tenant'
import { useWireAuthToken } from '../hooks/useWireAuthToken'

export function InvitePage() {
  const { token }  = useParams<{ token: string }>()
  // /invite is a top-level route OUTSIDE RequireAuth, so the api token getter
  // isn't wired here unless we do it ourselves — without this, accept() fires
  // unauthenticated and the backend returns 401 (same reason OnboardingProfilePage
  // calls this hook). useAuth alone only reads state; it never wires the token.
  const { isSignedIn, isLoaded } = useWireAuthToken()
  const [accepted, setAccepted]  = useState(false)
  const [error, setError]        = useState<string | null>(null)

  const { data: preview, isLoading, isError } = useQuery({
    queryKey: ['invite-preview', token],
    queryFn:  () => api.invites.preview(token!),
    enabled:  !!token,
    retry: false,
  })

  const accept = useMutation({
    mutationFn: () => api.invites.accept(token!),
    onSuccess: (member) => {
      // Pin the newly joined org and land there. Full reload so the (now stale)
      // memberships cache is rebuilt against the freshly selected tenant.
      setSelectedTenantId(member.tenantId)
      setAccepted(true)
      setTimeout(() => window.location.assign('/dashboard'), 2000)
    },
    onError: (err: Error) => setError(err.message),
  })

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg)',
  }
  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--line)',
    borderRadius: 'var(--r)', padding: '40px 48px', maxWidth: 440, width: '100%',
    display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center',
  }
  const titleStyle: React.CSSProperties = {
    fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: 0,
  }
  const subtitleStyle: React.CSSProperties = {
    fontSize: 15, color: 'var(--muted)', margin: 0,
  }
  const btnStyle: React.CSSProperties = {
    background: 'var(--btn-bg)', color: 'var(--btn-fg)', border: 'none',
    borderRadius: 'var(--r-sm)', padding: '10px 24px', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', width: '100%',
  }

  if (!isLoaded || isLoading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={subtitleStyle}>Loading…</p>
        </div>
      </div>
    )
  }

  if (isError || !preview) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Invite not found</h1>
          <p style={subtitleStyle}>This link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  if (!preview.valid) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Invite expired</h1>
          <p style={subtitleStyle}>This invite link is no longer valid. Ask your admin to generate a new one.</p>
        </div>
      </div>
    )
  }

  if (accepted) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Welcome to {preview.tenantName}!</h1>
          <p style={subtitleStyle}>You're now a member. Redirecting to the dashboard…</p>
        </div>
      </div>
    )
  }

  const roleLabel = preview.role === 'super_admin' ? 'Super Admin'
    : preview.role === 'division_admin' ? 'Division Admin'
    : 'Member'

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>You're invited to join</h1>
        <p style={{ ...titleStyle, fontSize: 26 }}>{preview.tenantName}</p>
        <p style={subtitleStyle}>
          Role: <strong style={{ color: 'var(--ink)' }}>{roleLabel}</strong>
        </p>
        <p style={{ ...subtitleStyle, fontSize: 13 }}>
          Expires {new Date(preview.expiresAt).toLocaleDateString()}
        </p>

        {error && (
          <p style={{ color: 'var(--block)', fontSize: 15, margin: 0 }}>{error}</p>
        )}

        {isSignedIn ? (
          <button
            style={btnStyle}
            disabled={accept.isPending}
            onClick={() => accept.mutate()}
          >
            {accept.isPending ? 'Joining…' : `Accept and join ${preview.tenantName}`}
          </button>
        ) : (
          <a
            href={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}
            style={{ ...btnStyle, display: 'block', textDecoration: 'none', lineHeight: '1.4' }}
          >
            Sign in to accept
          </a>
        )}
      </div>
    </div>
  )
}
