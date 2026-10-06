import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/members', label: 'Members' },
  { to: '/org',     label: 'Teams' },
]

/** Members / Teams tab strip shared by the two People screens. */
export function PeopleTabs() {
  return (
    <nav aria-label="People sections" style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--line)', marginBottom: 22 }}>
      {TABS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          style={({ isActive }) => ({
            borderBottom: `2px solid ${isActive ? 'var(--ink)' : 'transparent'}`,
            marginBottom: -1, padding: '8px 2px 10px', textDecoration: 'none',
            fontSize: 16, fontWeight: isActive ? 600 : 400,
            color: isActive ? 'var(--ink)' : 'var(--muted)',
          })}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
