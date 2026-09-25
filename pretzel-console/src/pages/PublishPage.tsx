import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { InlineLoader } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { usePolicy, usePolicyDraft, usePolicyHistory, usePolicyMutations } from '../hooks/usePolicy'
import type { DraftChange } from '../types'

const KIND_STYLE: Record<DraftChange['kind'], { label: string; bg: string; fg: string }> = {
  added:   { label: 'Added',   bg: 'var(--brand-soft)', fg: 'var(--brand)' },
  changed: { label: 'Changed', bg: 'var(--warn-fill)',  fg: 'var(--warn)' },
  removed: { label: 'Removed', bg: 'var(--block-fill)', fg: 'var(--block)' },
}

const ENTITY_LABEL: Record<DraftChange['entity'], string> = {
  subject:    'Policy',
  rule:       'Rule',
  siteConfig: 'Site',
  failMode:   'Setting',
}

export function PublishPage() {
  const { data: policy, isLoading: loadingPolicy } = usePolicy()
  const { data: draft } = usePolicyDraft()
  const { data: history = [], isLoading: loadingHistory } = usePolicyHistory()
  const { publish, rollback } = usePolicyMutations()
  const [rollbackVersion, setRollbackVersion] = useState<number | null>(null)

  return (
    <div style={{ padding: '32px 36px 40px', display: 'flex', flexDirection: 'column', gap: 26, maxWidth: 980 }}>
      <div>
        <PageHeader title="Publish" />
        <p style={{ margin: '-14px 0 0', fontSize: 15, color: 'var(--muted)' }}>
          Browsers pick up changes within two minutes. You can roll back to any earlier snapshot.
        </p>
      </div>

      <div style={{
        background: 'var(--brand-soft)', borderRadius: 'var(--r)', padding: '20px 22px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--brand)', flexShrink: 0 }} />
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: '0 0 2px' }}>
              Current published policy
            </h2>
            {loadingPolicy ? (
              <InlineLoader />
            ) : policy ? (
              <p style={{ fontSize: 15, color: 'var(--muted)', margin: 0 }}>
                Version {policy.version} · {policy.tenantName} · {policy.plan}
                {draft && draft.count === 0 ? ' · No unpublished changes' : ''}
              </p>
            ) : (
              <p style={{ fontSize: 15, color: 'var(--muted)', margin: 0 }}>No policy published yet</p>
            )}
          </div>
        </div>
      </div>

      {draft && (draft.count > 0 || draft.liveVersion === null) && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
          <div style={{
            padding: '18px 20px', background: 'var(--warn-fill)', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {draft.count} change{draft.count === 1 ? '' : 's'} not live
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 2 }}>
                {draft.liveVersion === null
                  ? 'Nothing is published yet'
                  : `People still get policy v${draft.liveVersion} until you publish`}
              </div>
            </div>
            <button
              onClick={() => publish.mutate()}
              disabled={publish.isPending}
              style={{ padding: '11px 20px', fontSize: 15, fontWeight: 500, color: 'var(--btn-fg)',
                       background: 'var(--btn-bg)', border: 'none', borderRadius: 'var(--r-btn)',
                       cursor: publish.isPending ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                       opacity: publish.isPending ? 0.5 : 1 }}
            >
              {publish.isPending ? 'Publishing…' : `Publish v${draft.nextVersion}`}
            </button>
          </div>
          {draft.changes.map(c => {
            const k = KIND_STYLE[c.kind]
            return (
              <div key={`${c.entity}:${c.id}:${c.kind}`} style={{
                padding: '16px 20px', borderTop: '1px solid var(--line)',
                display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr)', gap: 14, alignItems: 'start',
              }}>
                <span style={{
                  fontSize: 13, fontWeight: 500, padding: '3px 10px', borderRadius: 'var(--r-btn)',
                  background: k.bg, color: k.fg, justifySelf: 'start',
                }}>{k.label}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 500, overflowWrap: 'anywhere' }}>{c.title}</span>
                  <span style={{ fontSize: 14, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{c.detail}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{ENTITY_LABEL[c.entity]}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {policy?.warning && (
        <div style={{ padding: '14px 18px', background: 'var(--warn-fill)',
                      borderRadius: 'var(--r)', fontSize: 15, color: 'var(--warn)', fontWeight: 500 }}>
          ⚠ {policy.warning === 'subscription_expiring' ? 'Subscription expiring soon' : policy.warning}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 8px' }}>Published versions</h2>
        {loadingHistory ? (
          <InlineLoader />
        ) : history.length === 0 ? (
          <EmptyState title="No versions yet" description="Publish your first policy to see history here." />
        ) : (
          <table style={{ width: '100%', fontSize: 15, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ink)' }}>
                {['Version', 'Published at', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px 10px 0', textAlign: 'left', fontSize: 13, fontWeight: 400,
                                       color: 'var(--muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '13px 14px 13px 0', fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--ink)' }}>v{h.version}</td>
                  <td style={{ padding: '13px 14px 13px 0', color: 'var(--muted)' }}>
                    {new Date(h.publishedAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '13px 0', textAlign: 'right' }}>
                    <button
                      onClick={() => setRollbackVersion(h.version)}
                      style={{ fontSize: 14, fontWeight: 500, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}
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
