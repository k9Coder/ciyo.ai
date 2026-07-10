import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { api } from '../api'
import { setSelectedTenantId } from '../lib/tenant'

export function InvitePage() {
  const { token }  = useParams<{ token: string }>()
  const { isSignedIn, isLoaded } = useAuth()
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
    background: 'var(--bg-base, #0f1117)',
  }
  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-surface, #1a1d27)', border: '1px solid var(--border, #2a2d3a)',
    borderRadius: 16, padding: '40px 48px', maxWidth: 440, width: '100%',
    display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center',
  }
  const titleStyle: React.CSSProperties = {
    fontSize: 22, fontWeight: 700, color: 'var(--text-primary, #e8eaf0)', margin: 0,
  }
  const subtitleStyle: React.CSSProperties = {
    fontSize: 14, color: 'var(--text-muted, #6b7280)', margin: 0,
  }
  const btnStyle: React.CSSProperties = {
    background: 'var(--brand-primary, #6c47ff)', color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600,
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
          Role: <strong style={{ color: 'var(--text-primary, #e8eaf0)' }}>{roleLabel}</strong>
        </p>
        <p style={{ ...subtitleStyle, fontSize: 11 }}>
          Expires {new Date(preview.expiresAt).toLocaleDateString()}
        </p>

        {error && (
          <p style={{ color: 'var(--status-danger, #ef4444)', fontSize: 13, margin: 0 }}>{error}</p>
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
