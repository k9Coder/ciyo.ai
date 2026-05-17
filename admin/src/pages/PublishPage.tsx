import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { usePolicy, usePolicyHistory, usePolicyMutations } from '../hooks/usePolicy'

export function PublishPage() {
  const { data: policy, isLoading: loadingPolicy } = usePolicy()
  const { data: history = [], isLoading: loadingHistory } = usePolicyHistory()
  const { publish, rollback } = usePolicyMutations()
  const [rollbackVersion, setRollbackVersion] = useState<number | null>(null)

  return (
    <>
      <PageHeader title="Publish" />

      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Current published policy</h2>
            {loadingPolicy ? (
              <p className="text-sm text-gray-400 mt-1">Loading…</p>
            ) : policy ? (
              <p className="text-sm text-gray-500 mt-1">Version {policy.version} · {policy.tenantName} · {policy.plan}</p>
            ) : (
              <p className="text-sm text-gray-400 mt-1">No policy published yet</p>
            )}
          </div>
          <button
            onClick={() => publish.mutate()}
            disabled={publish.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {publish.isPending ? 'Publishing…' : 'Publish now'}
          </button>
        </div>
        {policy?.warning && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            ⚠ {policy.warning === 'subscription_expiring' ? 'Subscription expiring soon' : policy.warning}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Published versions</h2>
        </div>
        {loadingHistory ? (
          <div className="p-6 text-sm text-gray-400">Loading…</div>
        ) : history.length === 0 ? (
          <EmptyState title="No versions yet" description="Publish your first policy to see history here." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="px-6 py-3">Version</th>
                <th className="px-6 py-3">Published at</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.map(h => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">v{h.version}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {new Date(h.publishedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => setRollbackVersion(h.version)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Rollback to this
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        open={rollbackVersion !== null}
        message={`Roll back to v${rollbackVersion}? This will republish that snapshot as the current policy.`}
        onClose={() => setRollbackVersion(null)}
        onConfirm={async () => {
          await rollback.mutateAsync(rollbackVersion!)
          setRollbackVersion(null)
        }}
        confirming={rollback.isPending}
      />
    </>
  )
}
