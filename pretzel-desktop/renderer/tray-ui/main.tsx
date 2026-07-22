import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

function TrayUI() {
  const [status, setStatus] = useState<StatusPayload>({ proxyRunning: false, policyAvailable: false })
  const [failMode, setFailMode] = useState<'open' | 'closed'>('open')
  const [showSignIn, setShowSignIn] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    window.pretzel.onStatusUpdate(setStatus)
    window.pretzel.getProxyStatus().then((s) =>
      setStatus((prev) => ({ ...prev, proxyRunning: s.proxyRunning, systemProxyActive: s.systemProxyActive }))
    )
    window.pretzel.onAuthNag(() => setShowSignIn(true))
    window.pretzel.onAuthSuccess(() => {
      setShowSignIn(false)
      setSigningIn(false)
      setAuthError(null)
    })
    window.pretzel.onAuthError((msg) => {
      setSigningIn(false)
      setAuthError(msg)
    })
  }, [])

  function handleSignIn() {
    setSigningIn(true)
    setAuthError(null)
    window.pretzel.signIn()
  }

  function handleFailModeChange(mode: 'open' | 'closed') {
    setFailMode(mode)
    window.pretzel.updateFailMode(mode)
  }

  const dot = status.proxyRunning ? '🟢' : '🔴'
  const policyLabel = status.policyAvailable ? 'Policy active' : 'No policy cached'
  const sysProxyLabel = status.systemProxyActive
    ? 'System proxy: active (Chrome + all apps)'
    : 'System proxy: inactive'
  const sysProxyColor = status.systemProxyActive ? '#2d6a4f' : '#555'

  return (
    <div style={{ padding: '1.25rem', fontFamily: 'system-ui, sans-serif', background: '#1a1a2e', color: '#e0e0e0', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={{ fontSize: '1.1rem' }}>{dot}</span>
        <span style={{ fontWeight: 600 }}>Pretzel Desktop</span>
      </div>

      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '0.4rem' }}>{policyLabel}</p>
      <p style={{ color: sysProxyColor, fontSize: '0.8rem', marginBottom: '1rem' }}>{sysProxyLabel}</p>

      {showSignIn && (
        <div style={{ background: '#16213e', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', borderLeft: '3px solid #ffd93d' }}>
          <p style={{ fontSize: '0.8rem', color: '#ffd93d', marginBottom: '0.5rem', fontWeight: 600 }}>
            Sign in to load your organisation's policy
          </p>
          <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.75rem' }}>
            Without authentication, only default rules apply.
          </p>
          {authError && (
            <p style={{ fontSize: '0.75rem', color: '#ff6b6b', marginBottom: '0.5rem' }}>{authError}</p>
          )}
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            style={{
              width: '100%', padding: '0.5rem',
              background: signingIn ? '#333' : '#4a90d9',
              color: '#fff', border: 'none', borderRadius: 6,
              cursor: signingIn ? 'default' : 'pointer', fontWeight: 600, fontSize: '0.85rem',
            }}
          >
            {signingIn ? 'Opening browser…' : 'Sign in with mykka.ai'}
          </button>
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.8rem', color: '#aaa', display: 'block', marginBottom: '0.4rem' }}>
          Fail mode
        </label>
        <select
          value={failMode}
          onChange={(e) => handleFailModeChange(e.target.value as 'open' | 'closed')}
          style={{ width: '100%', padding: '0.4rem', background: '#16213e', color: '#e0e0e0', border: '1px solid #333', borderRadius: 4 }}
        >
          <option value="open">Fail open (allow on error)</option>
          <option value="closed">Fail closed (block on error)</option>
        </select>
      </div>

      <p style={{ color: '#555', fontSize: '0.75rem' }}>
        Proxy: 127.0.0.1:18888
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<TrayUI />)
