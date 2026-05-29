import { NavLink, Outlet, Link } from 'react-router-dom'
import { useOrganization, useUser, UserButton } from '@clerk/react'
import { ToastContainer } from '../ui/ToastContainer'
import { getTheme, setTheme } from '../../utils/theme'
import { useState } from 'react'

const NAV = [
  { to: '/dashboard',  label: 'Dashboard',  icon: '▦',  ai: false, dividerAbove: false },
  { to: '/subjects',   label: 'Policies',   icon: '⊡',  ai: false, dividerAbove: false },
  { to: '/org',        label: 'Teams',      icon: '⊞',  ai: false, dividerAbove: false },
  { to: '/members',    label: 'Members',    icon: '◎',  ai: false, dividerAbove: false },
  { to: '/audit',      label: 'Audit Log',  icon: '≡',  ai: false, dividerAbove: false },
  { to: '/assistant',  label: 'AI Assistant', icon: null, ai: true,  dividerAbove: true  },
  { to: '/settings',   label: 'Settings',   icon: '⚙',  ai: false, dividerAbove: false },
]

function SparkleIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M8 1 L9.2 6.2 L14 8 L9.2 9.8 L8 15 L6.8 9.8 L2 8 L6.8 6.2 Z"
        fill={color}
      />
    </svg>
  )
}

function ThemeToggle() {
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => getTheme())
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }
  return (
    <button onClick={toggle} title="Toggle theme" style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
      color: 'var(--text-muted)', fontSize: 14, lineHeight: 1,
    }}>
      {theme === 'dark' ? '☀' : '🌙'}
    </button>
  )
}

export function AppLayout() {
  const { organization } = useOrganization()
  const { user } = useUser()

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)',
                  fontFamily: "'Segoe UI', system-ui, sans-serif", overflow: 'hidden' }}>

      {/* Sidebar */}
      <aside style={{
        width: 210, flexShrink: 0, background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <Link to="/dashboard" style={{ padding: '18px 16px', borderBottom: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', gap: 10,
                      textDecoration: 'none', cursor: 'pointer' }}>
          <svg width="28" height="28" viewBox="0 0 56 56" fill="none">
            <rect width="56" height="56" rx="14" fill="var(--bg-base)"/>
            <path d="M20 14 L14 14 L14 42 L20 42"
                  stroke="var(--brand-primary)" strokeWidth="3"
                  strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="34" cy="28" r="5" fill="var(--brand-primary)"/>
            <path d="M30 18 L38 18 L38 24"
                  stroke="var(--brand-primary)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
          </svg>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.5px' }}>
            <span style={{ color: 'var(--text-primary)' }}>c</span>
            <span style={{ color: 'var(--brand-primary)' }}>i</span>
            <span style={{ color: 'var(--text-primary)' }}>yo</span>
          </span>
        </Link>

        {/* Org badge */}
        {organization && (
          <div style={{
            margin: '10px 10px 4px', background: 'var(--bg-surface-raised)',
            borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border)',
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 9,
                          letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Organization
            </div>
            <div style={{ color: 'var(--text-primary)', fontSize: 12,
                          fontWeight: 600, marginTop: 3 }}>
              {organization.name}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ padding: 8, flex: 1 }}>
          {NAV.map(({ to, label, icon, ai, dividerAbove }) => (
            <div key={to}>
              {dividerAbove && (
                <div style={{ margin: '6px 4px 8px', borderTop: '1px solid var(--border)' }} />
              )}
              <NavLink to={to} style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 12px', borderRadius: 6, marginBottom: 2,
                textDecoration: 'none', fontSize: 12, transition: 'all 0.1s',
                background: isActive
                  ? (ai ? 'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 15%, var(--bg-surface-raised)))' : 'var(--bg-surface-raised)')
                  : (ai ? 'color-mix(in srgb, var(--brand-primary) 6%, transparent)' : 'transparent'),
                color: isActive
                  ? 'var(--brand-primary)'
                  : (ai ? 'var(--brand-primary)' : 'var(--text-muted)'),
                fontWeight: isActive ? 600 : (ai ? 500 : 400),
                border: isActive
                  ? '1px solid var(--border)'
                  : (ai ? '1px solid color-mix(in srgb, var(--brand-primary) 20%, transparent)' : '1px solid transparent'),
                opacity: isActive ? 1 : (ai ? 0.85 : 1),
              })}>
                {ai
                  ? <SparkleIcon size={13} color="var(--brand-primary)" />
                  : <span style={{ fontSize: 13 }}>{icon}</span>
                }
                {label}
                {ai && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: 8, fontWeight: 700, letterSpacing: '0.5px',
                    color: 'var(--brand-primary)',
                    background: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--brand-primary) 25%, transparent)',
                    borderRadius: 4, padding: '1px 5px',
                    lineHeight: 1.6,
                  }}>
                    NEW
                  </span>
                )}
              </NavLink>
            </div>
          ))}
        </nav>

        {/* User */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <UserButton afterSignOutUrl="/login" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 11,
                          fontWeight: 600, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.fullName ?? user?.primaryEmailAddress?.emailAddress}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>Admin</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{
          padding: '21px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)', display: 'flex',
          justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <ThemeToggle />
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)' }}>
          <Outlet />
        </div>

        {/* Footer */}
        <div style={{
          height: 54.5, flexShrink: 0, borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface)', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', padding: '0 24px',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>c</span>
            <span style={{ color: 'var(--brand-primary)', fontWeight: 700 }}>i</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>yo</span>
            <span style={{ marginLeft: 6 }}>© {new Date().getFullYear()} · DLP for the AI era</span>
          </span>
          <a href="https://ciyo.ai" target="_blank" rel="noreferrer"
             style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none' }}>
            ciyo.ai
          </a>
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
