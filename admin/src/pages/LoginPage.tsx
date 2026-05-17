import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setToken, api, AdminApiError } from '../api'

export function LoginPage() {
  const [token, setTokenInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) return
    setLoading(true)
    setError(null)
    try {
      setToken(token.trim())
      await api.subjects.list()
      navigate('/subjects')
    } catch (err) {
      setToken('')
      setError(
        err instanceof AdminApiError && (err.status === 401 || err.status === 403)
          ? 'Invalid token — must start with ps_adm_ and match your organisation.'
          : 'Could not reach the server. Is the backend running?'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white font-bold">PS</div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">PromptShield Admin</h1>
            <p className="text-sm text-gray-500">Enter your admin token to continue</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">Admin token</label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="ps_adm_yourfirm_..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="current-password"
            />
          </div>
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
