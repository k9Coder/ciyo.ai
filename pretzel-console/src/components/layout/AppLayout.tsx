import { NavLink, Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useUser, UserButton } from '@clerk/react'
import { ToastContainer } from '../ui/ToastContainer'
import { getTheme, setTheme } from '../../utils/theme'
import { useState, useEffect, useRef } from 'react'
import { UpgradeBanner, PilotBanner, PlanBadge } from '../billing/UpgradeBanner'
import { PretzelLogo } from './PretzelLogo'
import { EnforcementBanner } from './EnforcementBanner'
import { FirstTimeWelcomeBanner } from './FirstTimeWelcomeBanner'
import { usePolicyRealtime } from '../../hooks/usePolicyRealtime'
import { usePolicy, usePolicyDraft } from '../../hooks/usePolicy'
import { useTenant } from '../../hooks/useTenant'
import { useMemberships, useActiveOrg } from '../../hooks/useMemberships'
import { getSelectedTenantId, setSelectedTenantId } from '../../lib/tenant'
import LogRocket from 'logrocket'
import { env } from '../../env'

const ONBOARDING_BADGE_ENABLED = env.VITE_FEATURE_ONBOARDING_BADGE === 'true'

const ROLE_LABEL: Record<string, string> = {
  super_admin:    'Super Admin',
  division_admin: 'Division Admin',
  member:         'Member',
}

function OnboardingBadge() {
  const { data: tenant } = useTenant()
  if (!ONBOARDING_BADGE_ENABLED) return null
  if (!tenant || tenant.onboardingWizardCompleted) return null
  return (
    <Link
      to="/onboarding/profile"
      style={{
        display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0,
        padding: '12px 14px', background: 'var(--brand-soft)',
        borderRadius: 'var(--r-sm)', textDecoration: 'none',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Complete setup</span>
      <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.35 }}>
        Apply a recommended DLP policy
      </span>
    </Link>
  )
}

// Labels follow the design. People covers both /members and /org (Members / Teams tabs).
const NAV = [
  { to: '/dashboard', label: 'Overview', ai: false, also: [] as string[] },
  { to: '/audit-log', label: 'Activity', ai: false, also: [] as string[] },
  { to: '/subjects', label: 'Policies', ai: false, also: [] as string[] },
  { to: '/members', label: 'People', ai: false, also: ['/org'] },
  { to: '/assistant', label: 'Assistant', ai: true, also: [] as string[] },
  { to: '/settings', label: 'Settings', ai: false, also: [] as string[] },
]

const SIDE_MIN = 190
const SIDE_MAX = 380
const SIDE_DEFAULT = 236
const SIDE_KEY = 'pretzel-sidebar-width'

function clampSide(w: number): number {
  return Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(w)))
}

function readSideWidth(): number {
  try {
    const saved = Number(localStorage.getItem(SIDE_KEY))
    return Number.isFinite(saved) && saved > 0 ? clampSide(saved) : SIDE_DEFAULT
  } catch {
    return SIDE_DEFAULT
  }
}

/** Resizable sidebar width (190–380px). Double-click the handle to reset. */
function useSidebarWidth() {
  const [width, setWidth] = useState<number>(() => readSideWidth())
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; w: number } | null>(null)

  useEffect(() => {
    if (!dragging) return
    function onMove(e: MouseEvent) {
      if (!start.current) return
      setWidth(clampSide(start.current.w + (e.clientX - start.current.x)))
    }
    function onUp() {
      setDragging(false)
      start.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  useEffect(() => {
    if (dragging) return
    try { localStorage.setItem(SIDE_KEY, String(width)) } catch { /* storage unavailable */ }
  }, [width, dragging])

  return {
    width,
    dragging,
    startResize: (e: React.MouseEvent) => {
      e.preventDefault()
      start.current = { x: e.clientX, w: width }
      setDragging(true)
    },
    resetResize: () => setWidth(SIDE_DEFAULT),
  }
}

function ThemeToggle() {
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => getTheme())
  function choose(next: 'dark' | 'light') {
    if (next === theme) return
    setTheme(next)
    setThemeState(next)
  }
  const pill = (active: boolean): React.CSSProperties => ({
    padding: '5px 11px', borderRadius: 'var(--r-btn)', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 13, color: 'var(--ink)',
    background: active ? (theme === 'dark' ? 'var(--fill2)' : 'var(--surface)') : 'transparent',
  })
  return (
    <div
      role="group"
      aria-label="Theme"
      style={{ display: 'flex', background: 'var(--fill)', borderRadius: 'var(--r-btn)', padding: 3, flexShrink: 0 }}
    >
      <button type="button" onClick={() => choose('light')} aria-pressed={theme === 'light'} aria-label="Switch to light theme" style={pill(theme === 'light')}>
        Light
      </button>
      <button type="button" onClick={() => choose('dark')} aria-pressed={theme === 'dark'} aria-label="Switch to dark theme" style={pill(theme === 'dark')}>
        Dark
      </button>
    </div>
  )
}

function OrgSwitcher() {
  const { data: memberships } = useMemberships()
  if (!memberships || memberships.length < 2) return null
  const selected = getSelectedTenantId() ?? ''

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedTenantId(e.target.value)
    window.location.assign('/dashboard')
  }

  return (
    <select
      aria-label="Switch organization"
      value={selected}
      onChange={onChange}
      style={{
        background: 'var(--fill)', color: 'var(--ink)',
        border: 'none', borderRadius: 'var(--r-btn)',
        padding: '7px 12px', fontSize: 13, cursor: 'pointer', maxWidth: 200,
      }}
    >
      {memberships.map(m => (
        <option key={m.tenantId} value={m.tenantId}>{m.tenantName}</option>
      ))}
    </select>
  )
}

/** "Ask Pretzel to change a rule…" bar. Opens the Assistant; also bound to ⌘K / Ctrl+K. */
function AskBar() {
  const navigate = useNavigate()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        navigate('/assistant')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
  return (
    <button
      type="button"
      onClick={() => navigate('/assistant')}
      style={{
        flex: 1, maxWidth: 520, background: 'var(--fill)', border: 'none',
        borderRadius: 'var(--r-btn)', padding: '10px 18px', fontFamily: 'var(--font)',
        fontSize: 15, color: 'var(--muted)', textAlign: 'left', cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', gap: 12,
        whiteSpace: 'nowrap', overflow: 'hidden',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Ask Pretzel to change a rule…</span>
      <span aria-hidden="true" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{isMac ? '⌘K' : 'Ctrl K'}</span>
    </button>
  )
}

function PublishStatus() {
  const { data: policy } = usePolicy()
  const { data: draft } = usePolicyDraft()
  if (!policy) return null

  if (draft && draft.count > 0) {
    return (
      <div style={{
        background: 'var(--warn-fill)', borderRadius: 'var(--r-sm)', padding: 14,
        display: 'flex', flexDirection: 'column', gap: 9, flexShrink: 0,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {draft.count} change{draft.count === 1 ? '' : 's'} not live
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--muted)' }}>
          People still get policy v{policy.version} until you publish.
        </div>
        <Link
          to="/publish"
          style={{
            background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 14, fontWeight: 500,
            padding: 9, borderRadius: 'var(--r-btn)', textAlign: 'center', textDecoration: 'none',
          }}
        >
          Review &amp; publish
        </Link>
      </div>
    )
  }

  return (
    <Link
      to="/publish"
      style={{
        background: 'var(--brand-soft)', borderRadius: 'var(--r-sm)', padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink)',
        textDecoration: 'none', flexShrink: 0,
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)', flexShrink: 0 }} />
      Policy v{policy.version} is live everywhere
    </Link>
  )
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase() || '?'
}

export function AppLayout() {
  const { pathname } = useLocation()
  const activeOrg = useActiveOrg()
  const { user } = useUser()
  const side = useSidebarWidth()
  usePolicyRealtime()

  useEffect(() => {
    if (!user) return
    LogRocket.identify(user.id, {
      ...(user.fullName ? { name: user.fullName } : {}),
      ...(user.primaryEmailAddress?.emailAddress ? { email: user.primaryEmailAddress.emailAddress } : {}),
    })
  }, [user?.id])

  const displayName = user?.fullName ?? user?.primaryEmailAddress?.emailAddress

  return (
    <div style={{
      display: 'flex', height: '100vh', minHeight: 640, background: 'var(--bg)',
      color: 'var(--ink)', fontFamily: 'var(--font)', overflow: 'hidden',
      userSelect: side.dragging ? 'none' : undefined,
      cursor: side.dragging ? 'col-resize' : undefined,
    }}>

      {/* Sidebar */}
      <aside style={{
        width: side.width, flexShrink: 0, boxSizing: 'border-box', padding: '18px 12px',
        display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto',
      }}>
        {/* Logo */}
        <Link to="/dashboard" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px',
          textDecoration: 'none', color: 'var(--ink)', flexShrink: 0,
        }}>
          <PretzelLogo size={26} />
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>mykka</span>
          {env.VITE_APP_ENV === 'staging' && (
            <span style={{
              background: 'var(--warn-fill)', color: 'var(--warn)',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.8px',
              padding: '2px 7px', borderRadius: 'var(--r-btn)',
            }}>
              STAGING
            </span>
          )}
        </Link>

        {/* Org card */}
        {activeOrg && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-sm)', padding: '11px 13px', flexShrink: 0,
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, overflowWrap: 'anywhere' }}>{activeOrg.tenantName}</div>
            <PilotBanner />
          </div>
        )}

        <UpgradeBanner />
        <OnboardingBadge />

        {/* Nav */}
        <nav aria-label="Main navigation" style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {NAV.map(({ to, label, ai, also }) => {
            const active = [to, ...also].some(p => pathname === p || pathname.startsWith(p + '/'))
            return (
              <NavLink key={to} to={to} aria-current={active ? 'page' : undefined} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 'var(--r-sm)', textDecoration: 'none',
                fontSize: 16, color: 'var(--ink)',
                background: active ? 'var(--surface)' : 'transparent',
                boxShadow: active ? 'inset 0 0 0 1px var(--line)' : 'none',
                fontWeight: active ? 600 : 400,
              }}>
                <span>{label}</span>
                {ai && <PlanBadge />}
              </NavLink>
            )
          })}
        </nav>

        <PublishStatus />

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', flexShrink: 0 }}>
          <UserButton fallback={
            <span aria-hidden="true" style={{
              width: 30, height: 30, borderRadius: '50%', background: 'var(--fill2)',
              fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{initials(displayName)}</span>
          } />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 500, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {displayName}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>{ROLE_LABEL[activeOrg?.role ?? 'member']}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, padding: '0 8px', flexShrink: 0, fontSize: 12 }}>
          <Link to="/accessibility" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Accessibility</Link>
          <a href="https://mykka.ai" target="_blank" rel="noreferrer" style={{ color: 'var(--muted)', textDecoration: 'none' }}>mykka.ai</a>
        </div>
      </aside>

      {/* Resize handle */}
      <div
        onMouseDown={side.startResize}
        onDoubleClick={side.resetResize}
        title="Drag to resize · double-click to reset"
        style={{
          width: 10, flexShrink: 0, cursor: 'col-resize', display: 'flex',
          justifyContent: 'center', userSelect: 'none', marginLeft: -10, zIndex: 1,
        }}
      >
        <div style={{ width: side.dragging ? 2 : 0, height: '100%', background: 'var(--brand)' }} />
      </div>

      {/* Main card */}
      <main style={{
        flex: 1, minWidth: 0, margin: '10px 10px 10px 0', background: 'var(--surface)',
        border: '1px solid var(--line)', borderRadius: 'var(--r)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Top bar */}
        <div style={{
          height: 62, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 28px', borderBottom: '1px solid var(--line)',
        }}>
          <AskBar />
          <div style={{ flex: 1 }} />
          <OrgSwitcher />
          <ThemeToggle />
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <FirstTimeWelcomeBanner />
          <EnforcementBanner />
          <Outlet />
        </div>
      </main>

      <ToastContainer />
    </div>
  )
}
