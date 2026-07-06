import { useEnforcementHealth } from '../../hooks/useEnforcementHealth'
import type { EnforcementReason } from '../../types'

const REASON_LABEL: Record<EnforcementReason, string> = {
  decision_timeout: 'detection timed out',
  bridge_error:     'a detection error',
  adapter_miss:     'the extension could not read the page (it may need an update)',
}

/**
 * Protection-degraded banner (B2 Layer 2). Surfaces two things:
 *  - explicit degraded signals reported by the extension (host + reason)
 *  - a silent-failure alarm when scans have dropped to zero despite active use
 */
export function EnforcementBanner() {
  const { data } = useEnforcementHealth()
  if (!data) return null

  const { degraded, silentFailure } = data
  if (degraded.length === 0 && !silentFailure) return null

  const color = '#ef4444'
  // Show the most frequent degraded host+reason first.
  const top = [...degraded].sort((a, b) => b.count - a.count).slice(0, 3)

  return (
    <div
      role="alert"
      style={{
        margin: '12px 24px 0',
        background: `color-mix(in srgb, ${color} 8%, var(--bg-surface-raised))`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        borderRadius: 8, padding: '10px 14px',
      }}
    >
      <div style={{ color, fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700 }}>
        Protection may be degraded
      </div>

      {silentFailure && (
        <div style={{ color: 'var(--text-primary)', fontSize: 12, marginTop: 4, fontWeight: 500 }}>
          No prompt scans recorded recently despite active members — the extension may have stopped enforcing.
          Confirm it is installed and up to date.
        </div>
      )}

      {top.map((h) => (
        <div key={`${h.hostname}:${h.reason}`} style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{h.hostname}</span>
          {' — '}{REASON_LABEL[h.reason]} ({h.count} in the last hour)
        </div>
      ))}
    </div>
  )
}
