import { useState } from 'react'
import { useActiveOrg } from '../hooks/useMemberships'
import { InlineLoader, Spinner } from '../components/ui/Spinner'
import {
  useAnalyticsSummary, useAnalyticsDaily, useAnalyticsIncidents,
  useAnalyticsTopSites, useAnalyticsBySubject,
} from '../hooks/useAnalytics'
import { usePolicy } from '../hooks/usePolicy'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function StatusBadge({ status }: { status: string }) {
  const isBlocked = status === 'block'
  return (
    <span style={{
      fontSize: 13, fontWeight: 500, padding: '3px 10px', borderRadius: 'var(--r-btn)',
      background: isBlocked ? 'var(--block-fill)' : 'var(--warn-fill)',
      color: isBlocked ? 'var(--block)' : 'var(--warn)',
    }}>
      {isBlocked ? 'Blocked' : 'Warned'}
    </span>
  )
}

function initials(email: string | null): string {
  if (!email) return '?'
  const parts = email.split('@')[0].split(/[._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg)', borderRadius: 'var(--r)', padding: 20,
  display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
}

export function DashboardPage() {
  const activeOrg = useActiveOrg()
  const [days, setDays] = useState<7 | 30 | 90>(30)

  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useAnalyticsSummary(days)
  const { data: daily = [], isError: dailyError }          = useAnalyticsDaily()
  const { data: incidents = [], isLoading: incidentsLoading, isError: incidentsError } = useAnalyticsIncidents()
  const { data: topSites = [], isError: topSitesError }    = useAnalyticsTopSites(days)
  const { data: bySubject = [], isError: bySubjectError }  = useAnalyticsBySubject(days)
  const { data: policyInfo }                               = usePolicy()

  const maxChart = Math.max(...daily.map(d => d.blocked + d.warned), 10)
  const dash = (v: number | undefined) => summaryLoading ? '—' : (v ?? 0).toLocaleString()

  const totalMembers = summary?.totalMembers ?? 0
  const activeUsers = summary?.activeUsers ?? 0
  const coveredPct = totalMembers > 0 ? Math.min(100, Math.round((activeUsers / totalMembers) * 100)) : 0

  return (
    <div style={{ padding: '32px 36px 40px', display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 1240 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 760 }}>
          <div style={{ fontSize: 15, color: 'var(--muted)' }}>
            Last {days} days · {activeOrg?.tenantName ?? 'All teams'}
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 2.8vw, 36px)', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.12 }}>
            Overview
          </h1>
          {!summaryLoading && !summaryError && (
            <p style={{ margin: '4px 0 0', fontSize: 17, lineHeight: 1.45, color: 'var(--muted)', textWrap: 'balance' } as React.CSSProperties}>
              Pretzel stopped <b style={{ color: 'var(--block)', fontWeight: 600 }}>{(summary?.blocked ?? 0).toLocaleString()}</b> prompts
              and flagged <b style={{ color: 'var(--warn)', fontWeight: 600 }}>{(summary?.warned ?? 0).toLocaleString()}</b>,
              out of {(summary?.scansTotal ?? 0).toLocaleString()} scanned.
            </p>
          )}
        </div>
        <div role="group" aria-label="Time range" style={{ display: 'flex', background: 'var(--fill)', borderRadius: 'var(--r-btn)', padding: 3 }}>
          {([7, 30, 90] as const).map(d => (
            <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} style={{
              padding: '6px 13px', border: 'none', borderRadius: 'var(--r-btn)', fontFamily: 'var(--font)',
              fontSize: 14, color: 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap',
              background: days === d ? 'var(--surface)' : 'transparent',
              boxShadow: days === d ? 'inset 0 0 0 1px var(--line)' : 'none',
            }}>{d}d</button>
          ))}
        </div>
      </div>

      {summaryError && (
        <p style={{ fontSize: 14, color: 'var(--block)', margin: 0 }}>
          Failed to load summary statistics. Please refresh to try again.
        </p>
      )}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {[
          { label: 'Prompts Scanned', raw: summary?.scansTotal,      sub: `${dash(summary?.activeUsers)} active users`, valColor: 'var(--ink)',   fill: 'var(--bg)' },
          { label: 'Threats Blocked', raw: summary?.blocked,          sub: `+ ${dash(summary?.warned)} warned`,          valColor: 'var(--block)', fill: 'var(--block-fill)' },
          { label: 'Active Users',    raw: summary?.activeUsers,      sub: `of ${dash(summary?.totalMembers)} members`,  valColor: 'var(--ink)',   fill: 'var(--bg)' },
          { label: 'Active Rules',    raw: summary?.activeRulesCount, sub: 'rules enforced',                             valColor: 'var(--brand)', fill: 'var(--brand-soft)' },
        ].map(({ label, raw, sub, valColor, fill }) => (
          <div key={label} style={{ background: fill, borderRadius: 'var(--r)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>{label}</div>
            <div style={{ color: valColor, fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1, minHeight: 42, display: 'flex', alignItems: 'center' }}>
              {summaryLoading ? <Spinner size="sm" /> : (raw ?? 0).toLocaleString()}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Incidents + side widgets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 28 }}>

        {/* Incidents list */}
        <div style={{ display: 'flex', flexDirection: 'column', gridColumn: 'span 2', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 19, fontWeight: 600 }}>Recent Incidents</span>
          </div>
          {incidentsLoading ? (
            <InlineLoader size="sm" />
          ) : incidentsError ? (
            <p style={{ padding: '16px 0', fontSize: 14, color: 'var(--block)', margin: 0 }}>
              Failed to load incidents.
            </p>
          ) : incidents.length === 0 ? (
            <div style={{ padding: '24px 0', color: 'var(--muted)', fontSize: 15 }}>
              No incidents recorded — set a report level above None on any rule to start collecting data
            </div>
          ) : (
            incidents.map((row) => (
              <div key={row.id} style={{
                display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) auto', gap: 12,
                alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)',
              }}>
                <span aria-hidden="true" style={{
                  width: 32, height: 32, borderRadius: '50%', background: 'var(--fill)',
                  fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{initials(row.memberEmail)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, overflowWrap: 'anywhere' }}>
                    <b style={{ fontWeight: 600 }}>{row.memberEmail ?? 'Anonymous'}</b> · {row.subjectName}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 1 }}>{timeAgo(row.occurredAt)}</div>
                </div>
                <StatusBadge status={row.action} />
              </div>
            ))
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Who's covered */}
          <div style={cardStyle}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>Who's covered</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 42, fontWeight: 600, letterSpacing: '-0.03em' }}>{dash(summary?.activeUsers)}</span>
              <span style={{ fontSize: 16, color: 'var(--muted)' }}>of {dash(summary?.totalMembers)} people</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--fill2)', overflow: 'hidden' }}>
              <div style={{ width: `${coveredPct}%`, height: '100%', background: 'var(--brand)' }} />
            </div>
          </div>

          {/* Activity chart — always last 7 days */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>Threat Activity — Last 7 Days</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 10 }}>
                {[['var(--block)', 'Blocked'], ['var(--warn)', 'Warned']].map(([c, l]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}
                  </span>
                ))}
              </span>
            </div>
            {dailyError ? (
              <p style={{ fontSize: 14, color: 'var(--block)', margin: 0 }}>
                Failed to load activity chart.
              </p>
            ) : (
              <div
                style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }}
                aria-label={`Threat activity bar chart. ${daily.map(d => `${d.day}: ${d.blocked} blocked, ${d.warned} warned`).join('; ')}`}
              >
                {(daily.length ? daily : Array.from({ length: 7 }, () => ({ day: '', date: '', blocked: 0, warned: 0, scanned: 0 }))).map(({ day, blocked, warned }, i) => {
                  const total = blocked + warned
                  // A day with zero incidents still gets a visible 2px baseline
                  // segment instead of a 0px div — a quiet day should read as
                  // "nothing happened" rather than look like a rendering gap.
                  const blockedH = total === 0 ? 0 : Math.max(2, Math.round((blocked / maxChart) * 72))
                  const warnedH  = total === 0 ? 2 : Math.max(warned === 0 ? 0 : 2, Math.round((warned / maxChart) * 72))
                  return (
                    <div key={day || i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 11, minHeight: 14 }}>{total > 0 ? total : ''}</span>
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', justifyContent: 'flex-end', height: 72 }}>
                        <div style={{ width: '100%', height: warnedH, background: total === 0 ? 'var(--fill2)' : 'var(--warn)', opacity: total === 0 ? 1 : 0.8, borderRadius: '2px 2px 0 0' }} />
                        <div style={{ width: '100%', height: blockedH, background: 'var(--block)' }} />
                      </div>
                      <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 11, marginTop: 4 }}>{day}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Breakdown row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>

        {/* Threat breakdown */}
        <div style={cardStyle}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>Threat Breakdown</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bySubjectError ? (
              <span style={{ fontSize: 14, color: 'var(--block)' }}>Failed to load threat breakdown.</span>
            ) : bySubject.length === 0 ? (
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>No data yet</span>
            ) : bySubject.map(({ subjectName, pct }, i) => {
              const colors = ['var(--block)', 'var(--warn)', 'var(--brand)', 'var(--muted)', 'var(--fill2)']
              return (
                <div key={subjectName}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 14 }}>
                    <span>{subjectName}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--fill2)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: colors[i % colors.length] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top sites */}
        <div style={cardStyle}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>Top Sites</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topSitesError ? (
              <span style={{ fontSize: 14, color: 'var(--block)' }}>Failed to load.</span>
            ) : topSites.length === 0 ? (
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>No data yet</span>
            ) : topSites.map(({ domain, count }, i) => {
              const colors = ['var(--brand)', 'var(--muted)', 'var(--fill2)', 'var(--warn)', 'var(--block)']
              return (
                <div key={domain} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[i % colors.length], flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--muted)' }}>{count.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Policy health */}
        <div style={cardStyle}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>Policy Health</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Members',      val: dash(summary?.totalMembers) },
              { label: 'Active rules', val: dash(summary?.activeRulesCount) },
              { label: 'Policy',       val: policyInfo ? `v${policyInfo.version}` : '—' },
            ].map(({ label, val }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                <span style={{ color: 'var(--muted)' }}>{label}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500, padding: '2px 9px', borderRadius: 'var(--r-btn)', background: 'var(--brand-soft)', color: 'var(--brand)' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
