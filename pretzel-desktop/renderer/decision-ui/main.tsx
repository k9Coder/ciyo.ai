import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Logo } from '../shared/Logo'
import './style.css'

function DecisionUI() {
  const [pending, setPending] = useState<DecisionPayload | null>(null)

  useEffect(() => {
    window.pretzel.onDecisionRequired((payload) => setPending(payload))
    // Tell main the listener is live so it (re)sends any pending decision —
    // otherwise the first block races React mount and is dropped.
    window.pretzel.decisionReady?.()
  }, [])

  function respond(allow: boolean) {
    if (!pending) return
    window.pretzel.respondDecision(pending.requestId, allow)
    setPending(null)
  }

  function alwaysAllow() {
    if (!pending) return
    // Target the highest-severity finding — the same one the header/pill
    // display is built from. Reported to the backend (not a local-only
    // mute) so it's admin-visible and applies from the next policy sync on;
    // this specific request is also let through right now, same as "Allow
    // anyway", since muting a rule and then still blocking the very message
    // that triggered the mute would be a confusing first impression.
    const ruleId = pending.findings[0]?.ruleId
    if (ruleId) window.pretzel.alwaysAllowRule(ruleId)
    respond(true)
  }

  if (!pending) {
    return <div className="waiting">Waiting for policy decision…</div>
  }

  const isBlock = pending.findings.some((f) => f.severity === 'critical')
  const severityClass = isBlock ? 'danger' : 'warn'

  return (
    <div className="app fade-in">
      <div className={`accent-bar ${severityClass}`} />
      <div className="body">
        <div className="header">
          <Logo size={26} />
          <div className="header-text">
            <p className={`title ${severityClass}`}>{isBlock ? 'Request Blocked' : 'Policy Warning'}</p>
            <p className="subtitle">
              Outbound request to <strong>{pending.hostname}</strong> triggered a policy rule.
            </p>
          </div>
        </div>

        <div className="findings-list">
          {pending.findings.map((f, i) => {
            const snippet = f.matchedText ?? f.snippet
            const pillClass = f.severity === 'critical' || f.severity === 'high' ? 'pill-danger' : 'pill-warn'
            return (
              <div className="finding-card" key={i}>
                <div className="finding-head">
                  <span className={`pill ${pillClass}`}>{f.severity}</span>
                  <span className="finding-rule">{f.ruleName ?? f.ruleId}</span>
                </div>
                {snippet && <p className="finding-snippet mono wrap-anywhere">{snippet}</p>}
              </div>
            )
          })}
        </div>

        <div className="actions">
          <button className="btn btn-danger" onClick={() => respond(false)}>
            Block
          </button>
          {!isBlock && (
            <button className="btn btn-safe" onClick={() => respond(true)}>
              Allow anyway
            </button>
          )}
        </div>
        <button className="always-allow-link" onClick={alwaysAllow}>
          Always allow this rule for me
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<DecisionUI />)
