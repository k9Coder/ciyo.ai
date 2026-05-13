import { useEffect, useState } from 'react'
import { api, AdminApiError, clearToken, type PolicyInfo } from '../api'

export function SettingsPage() {
  const [info, setInfo] = useState<PolicyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.policy.get()
      .then(setInfo)
      .catch(e => setError(e instanceof AdminApiError ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function handleSignOut() {
    clearToken()
    window.location.reload()
  }

  const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    past_due: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Organisation info and billing status.</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      ) : info === null ? (
        <p className="text-sm text-gray-400">No policy data available.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <div className="px-5 py-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">Organisation</span>
            <span className="text-sm font-medium text-gray-900">{info.tenantName}</span>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">Plan</span>
            <span className="text-sm font-medium text-gray-900 capitalize">{info.plan}</span>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">Policy version</span>
            <span className="text-sm font-medium text-gray-900">v{info.version}</span>
          </div>
          {info.expiresAt && (
            <div className="px-5 py-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">Renewal / expiry</span>
              <span className="text-sm font-medium text-gray-900">
                {new Date(info.expiresAt).toLocaleDateString()}
              </span>
            </div>
          )}
          {info.warning === 'subscription_expiring' && (
            <div className="px-5 py-4">
              <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusColor['past_due'] ?? ''}`}>
                Subscription expiring soon
              </div>
            </div>
          )}
        </div>
      )}

      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={handleSignOut}
          className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
