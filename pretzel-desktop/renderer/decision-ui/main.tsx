import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

interface DecisionPayload {
  requestId: string
  hostname: string
  findings: Array<{ ruleId: string; severity: string; snippet?: string }>
}

declare global {
  interface Window {
    pretzel: {
      onDecisionRequired: (cb: (p: DecisionPayload) => void) => void
      respondDecision: (requestId: string, allow: boolean) => void
    }
  }
}

function DecisionUI() {
  const [pending, setPending] = useState<DecisionPayload | null>(null)

  useEffect(() => {
    window.pretzel.onDecisionRequired((payload) => setPending(payload))
  }, [])

  function respond(allow: boolean) {
    if (!pending) return
    window.pretzel.respondDecision(pending.requestId, allow)
    setPending(null)
  }

  if (!pending) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
        <p>Waiting for policy decision...</p>
      </div>
    )
  }

  const highestSeverity = pending.findings[0]?.severity ?? 'medium'
  const isBlock = pending.findings.some(f => f.severity === 'critical')

  return (
    <div style={{ padding: '1.5rem', maxWidth: 440, margin: '0 auto' }}>
      <h2 style={{ color: isBlock ? '#ff6b6b' : '#ffd93d', marginBottom: '0.5rem' }}>
        {isBlock ? 'Request Blocked' : 'Policy Warning'}
      </h2>
      <p style={{ marginBottom: '1rem', color: '#aaa' }}>
        Outbound request to <strong style={{ color: '#e0e0e0' }}>{pending.hostname}</strong> triggered a policy rule.
      </p>

      <div style={{ background: '#16213e', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem' }}>
        {pending.findings.map((f, i) => (
          <div key={i} style={{ marginBottom: i < pending.findings.length - 1 ? '0.5rem' : 0 }}>
            <span style={{ color: '#ff6b6b', fontSize: '0.8rem', fontWeight: 600 }}>{f.severity.toUpperCase()}</span>
            <span style={{ marginLeft: '0.5rem', color: '#ccc', fontSize: '0.85rem' }}>{f.ruleId}</span>
            {f.snippet && <p style={{ color: '#777', fontSize: '0.75rem', marginTop: 2, fontFamily: 'monospace' }}>{f.snippet}</p>}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={() => respond(false)}
          style={{ flex: 1, padding: '0.6rem', background: '#c0392b', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
        >
          Block
        </button>
        {!isBlock && (
          <button
            onClick={() => respond(true)}
            style={{ flex: 1, padding: '0.6rem', background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            Allow anyway
          </button>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<DecisionUI />)
