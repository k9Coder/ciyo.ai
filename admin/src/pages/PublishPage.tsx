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
    <div style={{ padding: '16px 24px' }}>
      <PageHeader title="Publish" />

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Current published policy
            </h2>
            {loadingPolicy ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Loading…</p>
            ) : policy ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                Version {policy.version} · {policy.tenantName} · {policy.plan}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No policy published yet</p>
            )}
          </div>
          <button
            onClick={() => publish.mutate()}
            disabled={publish.isPending}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, color: 'var(--bg-base)',
                     background: 'var(--brand-primary)', border: 'none', borderRadius: 6, cursor: 'pointer',
                     opacity: publish.isPending ? 0.5 : 1 }}
          >
            {publish.isPending ? 'Publishing…' : 'Publish now'}
          </button>
        </div>
        {policy?.warning && (
          <div style={{ padding: '10px 14px', background: 'rgba(204,136,0,0.1)', border: '1px solid rgba(204,136,0,0.3)',
                        borderRadius: 8, fontSize: 13, color: 'var(--status-warn)' }}>
            ⚠ {policy.warning === 'subscription_expiring' ? 'Subscription expiring soon' : policy.warning}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Published versions</h2>
        </div>
        {loadingHistory ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
        ) : history.length === 0 ? (
          <EmptyState title="No versions yet" description="Publish your first policy to see history here." />
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Version', 'Published at', ''].map(h => (
                  <th key={h} style={{ padding: '10px 24px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                                       letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={h.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <td style={{ padding: '10px 24px', fontWeight: 600, color: 'var(--text-primary)' }}>v{h.version}</td>
                  <td style={{ padding: '10px 24px', color: 'var(--text-secondary)' }}>
                    {new Date(h.publishedAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 24px', textAlign: 'right' }}>
                    <button
                      onClick={() => setRollbackVersion(h.version)}
                      style={{ fontSize: 13, color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
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
    </div>
  )
}
