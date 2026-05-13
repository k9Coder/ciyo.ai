import { useEffect, useState } from 'react'
import { api, AdminApiError, type HistoryEntry } from '../api'

type Status = { kind: 'idle' } | { kind: 'error'; msg: string } | { kind: 'success'; msg: string }

export function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [rollingBack, setRollingBack] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    try {
      setHistory(await api.policy.history())
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Failed to load history' })
    } finally {
      setLoading(false)
    }
  }

  async function handleRollback(version: number) {
    if (!window.confirm(`Roll back to version ${version}? This will publish it as a new version.`)) return
    setRollingBack(version)
    setStatus({ kind: 'idle' })
    try {
      const result = await api.policy.rollback(version)
      setStatus({ kind: 'success', msg: `Rolled back to v${version} — published as v${result.version}.` })
      await load()
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Rollback failed' })
    } finally {
      setRollingBack(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Policy History</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          All published policy versions, newest first. Roll back to re-publish any past version.
        </p>
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
      ) : history.length === 0 ? (
        <p className="text-sm text-gray-400">No policy versions published yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Version</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Published</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {history.map((entry, i) => (
                <tr key={entry.version} className={`border-b border-gray-50 ${i === 0 ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    v{entry.version}
                    {i === 0 && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                        current
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(entry.publishedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {i > 0 && (
                      <button
                        onClick={() => void handleRollback(entry.version)}
                        disabled={rollingBack === entry.version}
                        className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {rollingBack === entry.version ? 'Rolling back…' : 'Roll back'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
