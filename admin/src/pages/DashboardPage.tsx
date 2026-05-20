import { useOrganization } from '@clerk/react'

const MOCK_STATS = {
  scanned: 48291,
  blocked: 1042,
  activeUsers: 312,
  totalUsers: 340,
  coverage: 94,
  activeRules: 21,
}

const MOCK_INCIDENTS = [
  { user: 'j.smith@acme.com',  type: 'API Key — OpenAI',    status: 'BLOCKED', when: '2m ago' },
  { user: 'm.lee@acme.com',    type: 'PII — Credit Card',   status: 'WARNED',  when: '14m ago' },
  { user: 'r.patel@acme.com',  type: 'Internal IP',         status: 'BLOCKED', when: '1h ago' },
  { user: 'a.chen@acme.com',   type: 'SSH Private Key',     status: 'BLOCKED', when: '2h ago' },
  { user: 't.garcia@acme.com', type: 'High-entropy token',  status: 'WARNED',  when: '3h ago' },
]

const MOCK_CHART = [
  { day: 'Mon', blocked: 22, warned: 14 },
  { day: 'Tue', blocked: 32, warned: 18 },
  { day: 'Wed', blocked: 18, warned: 10 },
  { day: 'Thu', blocked: 42, warned: 22 },
  { day: 'Fri', blocked: 28, warned: 16 },
  { day: 'Sat', blocked: 12, warned:  8 },
  { day: 'Sun', blocked: 10, warned:  6 },
]

const MOCK_THREATS = [
  { label: 'API Keys',     pct: 48, color: 'var(--status-danger)' },
  { label: 'PII',          pct: 27, color: 'var(--status-warn)' },
  { label: 'Private Keys', pct: 14, color: 'var(--brand-primary)' },
  { label: 'Internal IPs', pct: 11, color: 'var(--text-muted)' },
]

const MAX_CHART = 50

function StatusBadge({ status }: { status: string }) {
  const isBlocked = status === 'BLOCKED'
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
      background: isBlocked ? 'rgba(224,48,80,0.12)' : 'rgba(204,136,0,0.12)',
      color: isBlocked ? 'var(--status-danger)' : 'var(--status-warn)',
    }}>
      {status}
    </span>
  )
}

export function DashboardPage() {
  const { organization } = useOrganization()

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column',
                  gap: 14, minHeight: '100%' }}>

      {/* Page title */}
      <div>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
          Dashboard
        </h1>
        <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
          Last 30 days · {organization?.name ?? 'All teams'}
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Prompts Scanned', value: MOCK_STATS.scanned.toLocaleString(),
            sub: '↑ 12% vs last month', subColor: 'var(--status-safe)' },
          { label: 'Threats Blocked', value: MOCK_STATS.blocked.toLocaleString(),
            sub: '↑ 8% vs last month', subColor: 'var(--status-danger)',
            valColor: 'var(--status-danger)' },
          { label: 'Active Users', value: MOCK_STATS.activeUsers.toString(),
            sub: `of ${MOCK_STATS.totalUsers} licensed`, subColor: 'var(--brand-primary)' },
          { label: 'Policy Coverage', value: `${MOCK_STATS.coverage}%`,
            sub: `${MOCK_STATS.activeRules} rules active`, subColor: 'var(--text-muted)',
            valColor: 'var(--brand-primary)' },
        ].map(({ label, value, sub, subColor, valColor }) => (
          <div key={label} style={{
            background: 'var(--bg-surface)', borderRadius: 10,
            padding: 16, border: '1px solid var(--border)',
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 9,
                          textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
            <div style={{ color: valColor ?? 'var(--text-primary)',
                          fontSize: 26, fontWeight: 700, margin: '6px 0 4px', lineHeight: 1 }}>
              {value}
            </div>
            <div style={{ color: subColor, fontSize: 10 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Activity chart */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 10,
                    border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
            Threat Activity — Last 7 Days
          </span>
          <div style={{ display: 'flex', gap: 16 }}>
            {[['var(--status-danger)', 'Blocked'], ['var(--status-warn)', 'Warned']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c }}/>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'flex-end',
                      gap: 8, height: 120 }}>
          {MOCK_CHART.map(({ day, blocked, warned }) => {
            const blockedH = Math.round((blocked / MAX_CHART) * 80)
            const warnedH  = Math.round((warned  / MAX_CHART) * 80)
            return (
              <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column',
                                      alignItems: 'center', gap: 2 }}>
                <div style={{ width: '50%', display: 'flex', flexDirection: 'column',
                              gap: 1, alignItems: 'center' }}>
                  <div style={{ width: '100%', height: warnedH,
                                background: 'var(--status-warn)', borderRadius: '2px 2px 0 0' }}/>
                  <div style={{ width: '100%', height: blockedH,
                                background: 'var(--status-danger)', borderRadius: '0 0 2px 2px' }}/>
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
        <div style={{ background: 'var(--bg-surface)', borderRadius: 10,
                      border: '1px solid var(--border)', overflow: 'hidden',
                      display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
              Recent Incidents
            </span>
            <span style={{ color: 'var(--brand-primary)', fontSize: 11, cursor: 'pointer' }}>
              View all →
            </span>
          </div>
          <div style={{ padding: '6px 16px', display: 'grid',
                        gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr', gap: 8,
                        background: 'var(--bg-surface-raised)',
                        borderBottom: '1px solid var(--border)' }}>
            {['User', 'Type', 'Status', 'When'].map(h => (
              <span key={h} style={{ color: 'var(--text-muted)', fontSize: 9,
                                     textTransform: 'uppercase', letterSpacing: '0.8px' }}>{h}</span>
            ))}
          </div>
          {MOCK_INCIDENTS.map((row, i) => (
            <div key={i} style={{
              padding: '9px 16px', display: 'grid',
              gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr', gap: 8, alignItems: 'center',
              borderBottom: i < MOCK_INCIDENTS.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{row.user}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{row.type}</span>
              <StatusBadge status={row.status} />
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{row.when}</span>
            </div>
          ))}
        </div>

        {/* Right widgets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Threat breakdown */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 10,
                        border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
                Threat Breakdown
              </span>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {MOCK_THREATS.map(({ label, pct, color }) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{label}</span>
                    <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-surface-raised)', borderRadius: 3 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top sites + Policy health */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 10,
                          border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>Top Sites</span>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { site: 'chatgpt.com',    count: '21.4k', color: 'var(--brand-primary)' },
                  { site: 'claude.ai',      count: '18.2k', color: 'var(--text-muted)' },
                  { site: 'gemini.google',  count: '8.6k',  color: 'var(--border)' },
                ].map(({ site, count, color }) => (
                  <div key={site} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }}/>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{site}</span>
                    </div>
                    <span style={{ color: 'var(--text-primary)', fontSize: 10, fontWeight: 600 }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 10,
                          border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>Policy Health</span>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Teams',    val: '8/9',  color: 'var(--brand-primary)' },
                  { label: 'Rules on', val: '21/24', color: 'var(--brand-primary)' },
                  { label: 'Last sync', val: '4m ago', color: 'var(--status-safe)' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{label}</span>
                    <span style={{
                      background: color === 'var(--status-safe)' ? 'transparent' : 'rgba(0,212,255,0.12)',
                      color, fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 600,
                    }}>{val}</span>
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
