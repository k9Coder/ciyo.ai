import React from 'react'

function timeAgo(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function ActivityFeed({ entries }: { entries: ActivityEntryPayload[] }) {
  if (entries.length === 0) return null

  return (
    <div className="status-card activity-card">
      <p className="settings-section-label">Recent activity</p>
      {entries.slice(0, 4).map((e, i) => (
        <div className="activity-row" key={i}>
          <span className={`dot ${e.action === 'block' ? 'dot-danger' : 'dot-warn'}`} />
          <span className="activity-text">
            {e.action === 'block' ? 'Blocked' : 'Flagged'} <strong>{e.ruleName}</strong> on {e.hostname}
          </span>
          <span className="activity-time">{timeAgo(e.timestamp)}</span>
        </div>
      ))}
    </div>
  )
}
