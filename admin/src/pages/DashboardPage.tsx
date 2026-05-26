import { useState } from 'react'
import { useOrganization } from '@clerk/react'
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
      fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
      background: isBlocked ? 'rgba(224,48,80,0.12)' : 'rgba(204,136,0,0.12)',
      color: isBlocked ? 'var(--status-danger)' : 'var(--status-warn)',
    }}>
      {isBlocked ? 'BLOCKED' : 'WARNED'}
    </span>
  )
}

export function DashboardPage() {
  const { organization } = useOrganization()
  const [days, setDays] = useState<7 | 30 | 90>(30)

  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary(days)
  const { data: daily = [] }                          = useAnalyticsDaily()
  const { data: incidents = [], isLoading: incidentsLoading } = useAnalyticsIncidents()
  const { data: topSites = [] }                       = useAnalyticsTopSites(days)
  const { data: bySubject = [] }                      = useAnalyticsBySubject(days)
  const { data: policyInfo }                          = usePolicy()

  const maxChart = Math.max(...daily.map(d => d.blocked + d.warned), 10)
  const dash = (v: number | undefined) => summaryLoading ? '—' : (v ?? 0).toLocaleString()

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Dashboard</h1>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            Last {days} days · {organization?.name ?? 'All teams'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {([7, 30, 90] as const).map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: days === d ? 'var(--brand-primary)' : 'var(--bg-surface-raised)',
              color: days === d ? '#fff' : 'var(--text-muted)',
            }}>{d}d</button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Prompts Scanned',  value: dash(summary?.scansTotal),       sub: `${dash(summary?.activeUsers)} active users`,      subColor: 'var(--brand-primary)' },
          { label: 'Threats Blocked',  value: dash(summary?.blocked),           sub: `+ ${dash(summary?.warned)} warned`,                subColor: 'var(--status-danger)', valColor: 'var(--status-danger)' },
          { label: 'Active Users',     value: dash(summary?.activeUsers),       sub: `of ${dash(summary?.totalMembers)} members`,         subColor: 'var(--brand-primary)' },
          { label: 'Active Rules',     value: dash(summary?.activeRulesCount),  sub: 'rules enforced',                                   subColor: 'var(--text-muted)', valColor: 'var(--brand-primary)' },
        ].map(({ label, value, sub, subColor, valColor }) => (
          <div key={label} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
            <div style={{ color: valColor ?? 'var(--text-primary)', fontSize: 26, fontWeight: 700, margin: '6px 0 4px', lineHeight: 1 }}>{value}</div>
            <div style={{ color: subColor, fontSize: 10 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Activity chart — always last 7 days */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>Threat Activity — Last 7 Days</span>
          <div style={{ display: 'flex', gap: 16 }}>
            {[['var(--status-danger)', 'Blocked'], ['var(--status-warn)', 'Warned']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c }}/>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
          {(daily.length ? daily : Array.from({ length: 7 }, () => ({ day: '', date: '', blocked: 0, warned: 0, scanned: 0 }))).map(({ day, blocked, warned }, i) => {
            const blockedH = Math.round((blocked / maxChart) * 80)
            const warnedH  = Math.round((warned  / maxChart) * 80)
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ width: '50%', display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
                  <div style={{ width: '100%', height: warnedH,  background: 'var(--status-warn)',   borderRadius: '2px 2px 0 0' }}/>
                  <div style={{ width: '100%', height: blockedH, background: 'var(--status-danger)', borderRadius: '0 0 2px 2px' }}/>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 6 }}>{day}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, flex: 1 }}>

        {/* Incidents table */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>Recent Incidents</span>
          </div>
          <div style={{ padding: '6px 16px', display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr', gap: 8, background: 'var(--bg-surface-raised)', borderBottom: '1px solid var(--border)' }}>
            {['User', 'Subject', 'Status', 'When'].map(h => (
              <span key={h} style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{h}</span>
            ))}
          </div>
          {incidentsLoading ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>
          ) : incidents.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No incidents recorded — set a report level above None on any rule to start collecting data
            </div>
          ) : (
            incidents.map((row, i) => (
              <div key={row.id} style={{ padding: '9px 16px', display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr', gap: 8, alignItems: 'center', borderBottom: i < incidents.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{row.memberEmail ?? 'Anonymous'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{row.subjectName}</span>
                <StatusBadge status={row.action} />
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{timeAgo(row.occurredAt)}</span>
              </div>
            ))
          )}
        </div>

        {/* Right widgets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Threat breakdown */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>Threat Breakdown</span>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bySubject.length === 0 ? (
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No data yet</span>
              ) : bySubject.map(({ subjectName, pct }, i) => {
                const colors = ['var(--status-danger)', 'var(--status-warn)', 'var(--brand-primary)', 'var(--text-muted)', 'var(--border)']
                return (
                  <div key={subjectName}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{subjectName}</span>
                      <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-surface-raised)', borderRadius: 3 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: colors[i % colors.length], borderRadius: 3 }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top sites + Policy health */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>Top Sites</span>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topSites.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>No data yet</span>
                ) : topSites.map(({ domain, count }, i) => {
                  const colors = ['var(--brand-primary)', 'var(--text-muted)', 'var(--border)', 'var(--status-warn)', 'var(--status-safe)']
                  return (
                    <div key={domain} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: colors[i % colors.length] }}/>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{domain}</span>
                      </div>
                      <span style={{ color: 'var(--text-primary)', fontSize: 10, fontWeight: 600 }}>{count.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>Policy Health</span>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Members',      val: dash(summary?.totalMembers),     color: 'var(--brand-primary)' },
                  { label: 'Active rules', val: dash(summary?.activeRulesCount), color: 'var(--brand-primary)' },
                  { label: 'Policy',       val: policyInfo ? `v${policyInfo.version}` : '—', color: 'var(--status-safe)' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{label}</span>
                    <span style={{ background: color === 'var(--status-safe)' ? 'transparent' : 'rgba(0,212,255,0.12)', color, fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
