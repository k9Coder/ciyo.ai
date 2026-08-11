import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

const infoIconStyle: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: '0.35rem',
  width: '14px',
  height: '14px',
  lineHeight: '14px',
  borderRadius: '50%',
  border: '1px solid #666',
  color: '#888',
  fontSize: '0.65rem',
  textAlign: 'center',
  cursor: 'default',
}

function InfoIcon({ title }: { title: string }) {
  return <span style={infoIconStyle} title={title}>i</span>
}

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current'; version: string }
  | { kind: 'available'; latest: string }
  | { kind: 'error' }

function TrayUI() {
  const [status, setStatus] = useState<StatusPayload>({ proxyRunning: false, policyAvailable: false })
  const [showSignIn, setShowSignIn] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [showCancelHint, setShowCancelHint] = useState(false)
  const [update, setUpdate] = useState<UpdateState>({ kind: 'idle' })

  useEffect(() => {
    if (!signingIn) {
      setShowCancelHint(false)
      return
    }
    // If the OS browser never visibly opens (no default browser registered,
    // sandboxed env, shell.openExternal silently no-op'd), the user has no
    // way to tell the difference from a slow-but-working sign-in without
    // this hint — give them a way out well before the 90s server timeout.
    const t = setTimeout(() => setShowCancelHint(true), 8000)
    return () => clearTimeout(t)
  }, [signingIn])

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
    // Launch auto-check found a newer version — surface it without the user asking.
    window.pretzel.onUpdateAvailable(({ latest }) => setUpdate({ kind: 'available', latest }))
  }, [])

  async function handleCheckForUpdate() {
    setUpdate({ kind: 'checking' })
    try {
      const r = await window.pretzel.checkForUpdate()
      if (r.updateAvailable && r.latest) {
        setUpdate({ kind: 'available', latest: r.latest })
      } else {
        setUpdate({ kind: 'current', version: r.current })
      }
    } catch {
      setUpdate({ kind: 'error' })
    }
  }

  function handleSignIn() {
    setSigningIn(true)
    setAuthError(null)
    window.pretzel.signIn()
  }

  function handleCancelSignIn() {
    window.pretzel.cancelSignIn()
  }

  const dot = status.proxyRunning ? '🟢' : '🔴'
  const policyLabel = status.policyAvailable ? 'Policy active' : 'No policy cached'
  const policyInfo = status.policyAvailable
    ? "Pretzel has your organisation's rules loaded and is checking traffic against them."
    : "Pretzel doesn't have your organisation's rules yet — sign in to load them. Until then, nothing is checked."
  const sysProxyLabel = status.systemProxyActive
    ? 'System proxy: active (Chrome + all apps)'
    : 'System proxy: inactive'
  const sysProxyInfo = status.systemProxyActive
    ? 'Pretzel is actively watching traffic on this device.'
    : "Pretzel isn't watching traffic yet — sign in to turn it on."
  const sysProxyColor = status.systemProxyActive ? '#2d6a4f' : '#555'

  return (
    <div style={{ padding: '1.25rem', fontFamily: 'system-ui, sans-serif', background: '#1a1a2e', color: '#e0e0e0', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={{ fontSize: '1.1rem' }}>{dot}</span>
        <span style={{ fontWeight: 600 }}>Pretzel Desktop</span>
      </div>

      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
        {policyLabel}
        <InfoIcon title={policyInfo} />
      </p>
      <p style={{ color: sysProxyColor, fontSize: '0.8rem', marginBottom: '1rem' }}>
        {sysProxyLabel}
        <InfoIcon title={sysProxyInfo} />
      </p>

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
          {showCancelHint && (
            <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
              <p style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.35rem' }}>
                Still waiting — didn't see a browser open?
              </p>
              <button
                onClick={handleCancelSignIn}
                style={{
                  background: 'none', border: 'none', color: '#4a90d9',
                  fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', padding: 0,
                }}
              >
                Cancel and try again
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ borderTop: '1px solid #2a2a44', paddingTop: '0.85rem', marginTop: '0.25rem' }}>
        {update.kind === 'available' ? (
          <div style={{ background: '#16213e', borderRadius: 8, padding: '0.75rem', borderLeft: '3px solid #4a90d9' }}>
            <p style={{ fontSize: '0.8rem', color: '#8ec1f0', marginBottom: '0.6rem', fontWeight: 600 }}>
              ⬆ Version {update.latest} available
            </p>
            <button
              onClick={() => window.pretzel.openDownloadPage()}
              style={{
                width: '100%', padding: '0.5rem',
                background: '#4a90d9', color: '#fff', border: 'none', borderRadius: 6,
                cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
              }}
            >
              Download update
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#888' }}>
              {update.kind === 'checking' && 'Checking…'}
              {update.kind === 'current' && `✓ Up to date (${update.version})`}
              {update.kind === 'error' && "Couldn't check — try again"}
              {update.kind === 'idle' && 'Check for updates'}
            </span>
            <button
              onClick={handleCheckForUpdate}
              disabled={update.kind === 'checking'}
              style={{
                background: 'none', border: '1px solid #444', borderRadius: 6,
                color: update.kind === 'checking' ? '#555' : '#8ec1f0',
                fontSize: '0.72rem', padding: '0.3rem 0.6rem',
                cursor: update.kind === 'checking' ? 'default' : 'pointer',
              }}
            >
              Check
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<TrayUI />)
