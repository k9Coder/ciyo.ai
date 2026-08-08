import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { useAuditLog } from '../hooks/useAuditLog'
import { InlineLoader, Spinner } from '../components/ui/Spinner'
import { formatDateTime } from '../utils/date'

type ActionFilter = 'all' | 'warn' | 'block'

const ACTION_FILTER_LABELS: Record<ActionFilter, string> = {
  all:   'All',
  warn:  'Warned',
  block: 'Blocked',
}

export function AuditLogPage() {
  const [filter, setFilter] = useState<ActionFilter>('all')
  const {
    data, isLoading, isFetchingNextPage,
    hasNextPage, fetchNextPage,
  } = useAuditLog(filter === 'all' ? undefined : filter)

  const entries = data?.pages.flatMap(p => p.entries) ?? []

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: active ? 600 : 400,
    border: active ? '1px solid var(--brand-primary)' : '1px solid var(--border)',
    background: active ? 'var(--brand-dim, rgba(0,212,255,0.08))' : 'transparent',
    color: active ? 'var(--brand-primary)' : 'var(--text-muted)',
    cursor: 'pointer',
  })

  return (
    <div style={{ padding: '16px 24px' }}>
      <PageHeader title="Audit Log" />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'warn', 'block'] as ActionFilter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={pillStyle(filter === f)}>
            {ACTION_FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {isLoading && <InlineLoader />}
        {!isLoading && entries.length === 0 && (
          <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            No events recorded yet.
          </p>
        )}
        {entries.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Time', 'Member', 'Subject', 'Action', 'Site', 'Matched'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left',
                    color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {formatDateTime(e.occurredAt)}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>
                    {e.memberEmail ?? <span style={{ color: 'var(--text-muted)' }}>anonymous</span>}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {e.subjectName}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span
                      data-testid="event-action"
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase',
                        background: e.action === 'block' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                        color:      e.action === 'block' ? 'var(--status-danger)'  : 'var(--status-warn)',
                      }}
                    >
                      {e.action}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(() => { try { return new URL(e.siteUrl).hostname } catch { return e.siteUrl } })()}
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                    {e.matchedTerm ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {hasNextPage && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                padding: '6px 16px', fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)',
              }}
            >
              {isFetchingNextPage ? <Spinner size="sm" /> : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
