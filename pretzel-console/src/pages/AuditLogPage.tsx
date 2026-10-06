import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { useAuditLog } from '../hooks/useAuditLog'
import { useRuleExceptions } from '../hooks/useRuleExceptions'
import { InlineLoader, Spinner } from '../components/ui/Spinner'
import { formatDateTime } from '../utils/date'

function RuleExceptionsPanel() {
  const { data, isLoading } = useRuleExceptions()
  const exceptions = data?.exceptions ?? []

  if (isLoading || exceptions.length === 0) return null

  return (
    <div style={{
      background: 'var(--warn-fill)', borderRadius: 'var(--r)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 18px 6px' }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
          Always-allowed rules
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 14, color: 'var(--muted)' }}>
          Rules individual members have muted for themselves from a desktop decision popup.
        </p>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <tbody>
          {exceptions.map(e => (
            <tr key={e.ruleId} style={{ borderTop: '1px solid var(--line)' }}>
              <td style={{ padding: '10px 18px', color: 'var(--ink)' }}>
                {e.ruleMessage ?? <span style={{ color: 'var(--muted)' }}>(no message set)</span>}
              </td>
              <td style={{ padding: '10px 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <span style={{
                  fontSize: 13, fontWeight: 500, padding: '3px 10px', borderRadius: 'var(--r-btn)',
                  background: 'var(--surface)', color: 'var(--warn)',
                }}>
                  {e.memberCount} member{e.memberCount === 1 ? '' : 's'}
                </span>
              </td>
              <td
                style={{
                  padding: '10px 18px', color: 'var(--muted)', fontSize: 13,
                  maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                title={e.memberEmails.join(', ')}
              >
                {e.memberEmails.join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

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
    padding: '6px 14px', border: 'none', borderRadius: 'var(--r-btn)',
    fontFamily: 'var(--font)', fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap',
    background: active ? 'var(--surface)' : 'transparent',
    boxShadow: active ? 'inset 0 0 0 1px var(--line)' : 'none',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
  })

  return (
    <div style={{ padding: '32px 36px 40px', display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1240 }}>
      <div>
        <PageHeader title="Activity" />
        <p style={{ margin: '-14px 0 0', fontSize: 15, color: 'var(--muted)' }}>
          Every prompt Pretzel warned about or blocked. What is recorded depends on each rule's report setting.
        </p>
      </div>

      <RuleExceptionsPanel />

      {/* Filter bar */}
      <div role="group" aria-label="Filter by action" style={{ display: 'flex', gap: 2, background: 'var(--fill)', borderRadius: 'var(--r-btn)', padding: 3, alignSelf: 'flex-start' }}>
        {(['all', 'warn', 'block'] as ActionFilter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={pillStyle(filter === f)}>
            {ACTION_FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'auto', overflowY: 'hidden' }}>
        {isLoading && <InlineLoader />}
        {!isLoading && entries.length === 0 && (
          <p style={{ padding: '24px 0', color: 'var(--muted)', fontSize: 15, margin: 0 }}>
            No events recorded yet.
          </p>
        )}
        {entries.length > 0 && (
          <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ink)' }}>
                {['Time', 'Member', 'Subject', 'Action', 'Site', 'Matched'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px 10px 0', textAlign: 'left',
                    color: 'var(--muted)', fontSize: 13, fontWeight: 400,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '12px 14px 12px 0', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {formatDateTime(e.occurredAt)}
                  </td>
                  <td style={{ padding: '12px 14px 12px 0', color: 'var(--ink)' }}>
                    {e.memberEmail ?? <span style={{ color: 'var(--muted)' }}>anonymous</span>}
                  </td>
                  <td style={{ padding: '12px 14px 12px 0', color: 'var(--ink)' }}>
                    {e.subjectName}
                  </td>
                  <td style={{ padding: '12px 14px 12px 0' }}>
                    <span
                      data-testid="event-action"
                      style={{
                        fontSize: 13, fontWeight: 500, padding: '3px 10px', borderRadius: 'var(--r-btn)', textTransform: 'capitalize',
                        background: e.action === 'block' ? 'var(--block-fill)' : 'var(--warn-fill)',
                        color:      e.action === 'block' ? 'var(--block)'  : 'var(--warn)',
                      }}
                    >
                      {e.action}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px 12px 0', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 13, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(() => { try { return new URL(e.siteUrl).hostname } catch { return e.siteUrl } })()}
                  </td>
                  <td style={{ padding: '12px 0', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--muted)' }}>
                    {e.matchedTerm ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {hasNextPage && (
          <div style={{ paddingTop: 16 }}>
            <button
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              style={{
                background: 'var(--fill)', border: 'none', borderRadius: 'var(--r-btn)',
                padding: '9px 16px', fontSize: 14, cursor: 'pointer', color: 'var(--ink)',
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
