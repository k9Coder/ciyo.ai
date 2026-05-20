import { NavLink, Outlet } from 'react-router-dom'
import { useOrganization, useUser, UserButton } from '@clerk/react'
import { ToastContainer } from '../ui/ToastContainer'
import { getTheme, setTheme } from '../../utils/theme'
import { useState } from 'react'

const NAV = [
  { to: '/dashboard',  label: 'Dashboard',  icon: '▦' },
  { to: '/subjects',   label: 'Policies',   icon: '⊡' },
  { to: '/org',        label: 'Teams',      icon: '⊞' },
  { to: '/members',    label: 'Members',    icon: '◎' },
  { to: '/audit',      label: 'Audit Log',  icon: '≡' },
  { to: '/settings',   label: 'Settings',   icon: '⚙' },
]

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
        <div style={{ padding: '18px 16px', borderBottom: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="22" height="22" viewBox="0 0 80 80" fill="none">
            <rect x="8" y="24" width="64" height="32" rx="10"
                  fill="var(--bg-base)" stroke="var(--brand-primary)" strokeWidth="2.5"/>
            <rect x="17" y="36" width="22" height="2" rx="1"
                  fill="var(--brand-primary)" opacity="0.5"/>
            <circle cx="60" cy="40" r="10" fill="var(--brand-primary)" opacity="0.12"/>
            <circle cx="60" cy="40" r="10" stroke="var(--brand-primary)" strokeWidth="2"/>
            <path d="M56 40L59 43L65 37" stroke="var(--brand-primary)" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.5px' }}>
            <span style={{ color: 'var(--text-primary)' }}>safe</span>
            <span style={{ color: 'var(--brand-primary)' }}>input</span>
          </span>
        </div>

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
          {NAV.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 12px', borderRadius: 6, marginBottom: 2,
              textDecoration: 'none', fontSize: 12, transition: 'all 0.1s',
              background: isActive ? 'var(--bg-surface-raised)' : 'transparent',
              color: isActive ? 'var(--brand-primary)' : 'var(--text-muted)',
              fontWeight: isActive ? 600 : 400,
              border: isActive ? '1px solid var(--border)' : '1px solid transparent',
            })}>
              <span style={{ fontSize: 13 }}>{icon}</span>
              {label}
            </NavLink>
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
          padding: '14px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)', display: 'flex',
          justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <ThemeToggle />
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)' }}>
          <Outlet />
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
