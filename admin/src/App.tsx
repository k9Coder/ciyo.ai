import { useState } from 'react'
import { getToken, clearToken } from './api'
import { LoginPage } from './pages/LoginPage'
import { MattersPage } from './pages/MattersPage'
import { PolicyPage } from './pages/PolicyPage'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'

type Tab = 'matters' | 'policy' | 'history' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'matters', label: 'Matters' },
  { id: 'policy', label: 'Policy' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
]

export function App() {
  const [authed, setAuthed] = useState(() => getToken() !== null)
  const [activeTab, setActiveTab] = useState<Tab>('matters')

  function handleSignOut() {
    clearToken()
    setAuthed(false)
  }

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            PS
          </div>
          <h1 className="text-xl font-semibold text-gray-900">PromptShield Admin</h1>
          <button
            onClick={handleSignOut}
            className="ml-auto text-xs text-gray-500 hover:text-gray-800"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {activeTab === 'matters' && <MattersPage />}
        {activeTab === 'policy' && <PolicyPage />}
        {activeTab === 'history' && <HistoryPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
