import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearToken } from '../../api'
import { ToastContainer } from '../ui/ToastContainer'

const NAV = [
  { to: '/subjects',     label: 'Subjects & Rules' },
  { to: '/org',          label: 'Org Structure' },
  { to: '/destinations', label: 'Destination Groups' },
  { to: '/sites',        label: 'Site Configs' },
  { to: '/publish',      label: 'Publish' },
  { to: '/settings',     label: 'Settings' },
]

export function AppLayout() {
  const navigate = useNavigate()

  function handleSignOut() {
    clearToken()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-52 shrink-0 bg-slate-800 flex flex-col">
        <div className="px-4 py-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-red-500 rounded flex items-center justify-center text-white text-xs font-bold">PS</div>
            <span className="text-white font-semibold text-sm">PromptShield</span>
          </div>
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-slate-700 text-white font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <button
            onClick={handleSignOut}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
      <ToastContainer />
    </div>
  )
}
