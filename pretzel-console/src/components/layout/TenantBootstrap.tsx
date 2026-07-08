import { useMemberships } from '../../hooks/useMemberships'
import {
  getSelectedTenantId, setSelectedTenantId, clearSelectedTenantId,
} from '../../lib/tenant'
import { PageLoader } from '../ui/Spinner'
import type { Membership } from '../../types'

function roleLabel(role: string): string {
  return role === 'super_admin' ? 'Super Admin'
    : role === 'division_admin' ? 'Division Admin'
    : 'Member'
}

/**
 * Sits inside RequireAuth (Clerk token already wired) and resolves which tenant
 * the console should talk to before rendering the app shell. Users invited to a
 * second org always have >1 membership, so we must pin an X-Tenant-Id selection
 * or the backend returns 400 on every call.
 */
export function TenantBootstrap({ children }: { children: React.ReactNode }) {
  const { data: memberships, isLoading, isError } = useMemberships()

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <PageLoader label="Loading organizations" />
      </div>
    )
  }

  // On error (or nowhere-enrolled) fall through to the app shell — do not regress
  // the existing "not enrolled" experience.
  if (isError || !memberships || memberships.length === 0) {
    return <>{children}</>
  }

  const selected = getSelectedTenantId()

  if (memberships.length === 1) {
    if (selected !== memberships[0]!.tenantId) setSelectedTenantId(memberships[0]!.tenantId)
    return <>{children}</>
  }

  const valid = selected && memberships.some(m => m.tenantId === selected)
  if (valid) return <>{children}</>

  // Invalid/stale persisted selection must be cleared, not silently kept.
  if (selected) clearSelectedTenantId()

  return <OrgPicker memberships={memberships} />
}

function OrgPicker({ memberships }: { memberships: Membership[] }) {
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
  const optionStyle: React.CSSProperties = {
    background: 'var(--bg-surface-raised, #232735)', border: '1px solid var(--border, #2a2d3a)',
    borderRadius: 8, padding: '14px 16px', cursor: 'pointer', width: '100%',
    display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left',
  }

  function choose(tenantId: string) {
    setSelectedTenantId(tenantId)
    window.location.assign('/dashboard')
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Choose an organization</h1>
        <p style={subtitleStyle}>You're a member of more than one organization. Pick one to continue.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {memberships.map(m => (
            <button key={m.tenantId} type="button" style={optionStyle} onClick={() => choose(m.tenantId)}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary, #e8eaf0)' }}>
                {m.tenantName}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)' }}>
                {roleLabel(m.role)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
