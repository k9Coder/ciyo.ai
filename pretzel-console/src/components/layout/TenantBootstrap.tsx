import { Navigate } from 'react-router-dom'
import { useMemberships } from '../../hooks/useMemberships'
import { useTenant } from '../../hooks/useTenant'
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

// The console is an admin surface. super_admin and division_admin may use it;
// a plain `member` has nothing to manage here (they use the desktop app /
// extension), so route them to /unauthorized instead of an app shell where
// every admin call 403s.
function isAdminRole(role: string): boolean {
  return role === 'super_admin' || role === 'division_admin'
}

function FullPageLoader({ label }: { label: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <PageLoader label={label} />
    </div>
  )
}

/**
 * Sits inside RequireAuth (Clerk token already wired) and resolves which tenant
 * the console should talk to before rendering the app shell. Users invited to a
 * second org always have >1 membership, so we must pin an X-Tenant-Id selection
 * or the backend returns 400 on every call.
 */
export function TenantBootstrap({ children }: { children: React.ReactNode }) {
  const { data: memberships, isLoading, isError, refetch, isRefetching } = useMemberships()

  // Only a lone super_admin can complete the onboarding wizard (the tenant
  // endpoint is admin-gated) — fetching it for anyone else would just draw a
  // 403. Hooks must run unconditionally every render, so gate the query
  // itself via `enabled`, not a conditional hook call.
  const singleSuperAdmin = memberships?.length === 1 && memberships[0]!.role === 'super_admin'
  const { data: tenant, isLoading: tenantLoading, isError: tenantError } = useTenant(singleSuperAdmin)

  if (isLoading) {
    return <FullPageLoader label="Loading organizations" />
  }

  // A fetch error (e.g. 429, or the Clerk-webhook race right after signup where
  // the tenant/membership row hasn't landed yet) is NOT the same state as a
  // user who legitimately belongs to zero orgs — conflating them used to send
  // brand-new signups straight to the dashboard instead of onboarding. Surface
  // a retry instead of silently proceeding.
  if (isError) {
    return <ErrorState onRetry={() => void refetch()} retrying={isRefetching} />
  }

  // Nowhere-enrolled (no error, genuinely zero memberships) — fall through to
  // the app shell. Preserves the existing "not enrolled" experience.
  if (!memberships || memberships.length === 0) {
    return <>{children}</>
  }

  const selected = getSelectedTenantId()

  if (memberships.length === 1) {
    if (selected !== memberships[0]!.tenantId) setSelectedTenantId(memberships[0]!.tenantId)

    if (!isAdminRole(memberships[0]!.role)) return <Navigate to="/unauthorized" replace />

    if (singleSuperAdmin) {
      // Don't flash the app shell then yank the user to /onboarding/profile —
      // hold on a loader until we know whether the wizard is done.
      if (tenantLoading) return <FullPageLoader label="Loading organization" />
      // Fail open on a tenant-fetch error: don't hard-block behind a transient
      // failure of an admin-status check that isn't itself the access gate.
      if (!tenantError && tenant && !tenant.onboardingWizardCompleted) {
        return <Navigate to="/onboarding/profile" replace />
      }
    }

    return <>{children}</>
  }

  const valid = selected && memberships.some(m => m.tenantId === selected)
  if (valid) {
    const active = memberships.find(m => m.tenantId === selected)!
    if (!isAdminRole(active.role)) return <Navigate to="/unauthorized" replace />
    return <>{children}</>
  }

  // Invalid/stale persisted selection must be cleared, not silently kept.
  if (selected) clearSelectedTenantId()

  return <OrgPicker memberships={memberships} />
}

function ErrorState({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base, #0f1117)',
    }}>
      <div style={{
        background: 'var(--bg-surface, #1a1d27)', border: '1px solid var(--border, #2a2d3a)',
        borderRadius: 16, padding: '40px 48px', maxWidth: 420, width: '100%',
        display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary, #e8eaf0)', margin: 0 }}>
          Couldn't load your account
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted, #6b7280)', margin: 0 }}>
          This can happen right after signup while your organization is still being set up.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          style={{
            background: 'var(--brand-primary, #6366f1)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600,
            cursor: retrying ? 'default' : 'pointer', opacity: retrying ? 0.7 : 1,
          }}
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    </div>
  )
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
