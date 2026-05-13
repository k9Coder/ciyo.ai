import { useEffect, useState } from 'react'
import { api, AdminApiError, type PolicyInfo } from '../api'

type Status = { kind: 'idle' } | { kind: 'error'; msg: string } | { kind: 'success'; msg: string }

export function PolicyPage() {
  const [info, setInfo] = useState<PolicyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    try {
      setInfo(await api.policy.get())
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 404) {
        setInfo(null)
      } else {
        setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Failed to load policy' })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    setStatus({ kind: 'idle' })
    try {
      const result = await api.policy.publish()
      setStatus({ kind: 'success', msg: `Version ${result.version} published successfully.` })
      await load()
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Publish failed' })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Policy</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Publishing compiles your current matters into a new policy version and pushes it to all machines within 30 minutes.
          </p>
        </div>
        <button
          onClick={handlePublish}
          disabled={publishing}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          {publishing ? 'Publishing…' : 'Publish new version'}
        </button>
      </div>

      {status.kind !== 'idle' && (
        <div className={`p-3 rounded-lg text-sm border ${
          status.kind === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {status.msg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : info === null ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500">
          No policy published yet. Click "Publish new version" to create the first version from your current matters.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex-1">
              <p className="text-xs text-gray-500 mb-1">Current version</p>
              <p className="text-2xl font-bold text-gray-900">v{info.version}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex-1">
              <p className="text-xs text-gray-500 mb-1">Organisation</p>
              <p className="text-sm font-semibold text-gray-900">{info.tenantName}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex-1">
              <p className="text-xs text-gray-500 mb-1">Plan</p>
              <p className="text-sm font-semibold text-gray-900 capitalize">{info.plan}</p>
            </div>
          </div>

          {info.warning === 'subscription_expiring' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 font-medium">
              Subscription expiring soon — renew to avoid policy delivery interruption.
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Compiled policy JSON</p>
            <textarea
              readOnly
              value={JSON.stringify(info.policy, null, 2)}
              className="w-full h-[50vh] font-mono text-xs border border-gray-200 rounded-xl p-4 bg-gray-50 resize-y focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  )
}
