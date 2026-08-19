import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Logo } from '../shared/Logo'
import { SettingsView } from './SettingsView'
import { WalkthroughView } from './WalkthroughView'
import { ActivityFeed } from './ActivityFeed'
import './style.css'

type View = 'status' | 'settings' | 'walkthrough'

function InfoIcon({ title }: { title: string }) {
  return <i className="info-icon" title={title}>i</i>
}

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current'; version: string }
  | { kind: 'available'; latest: string; canAutoUpdate: boolean }
  | { kind: 'downloading'; percent: number }
  | { kind: 'downloaded' }
  | { kind: 'error' }

function TrayUI() {
  const [status, setStatus] = useState<StatusPayload>({ proxyRunning: false, policyAvailable: false })
  const [showSignIn, setShowSignIn] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [showCancelHint, setShowCancelHint] = useState(false)
  const [update, setUpdate] = useState<UpdateState>({ kind: 'idle' })
  const [view, setView] = useState<View>('status')
  const [activity, setActivity] = useState<ActivityEntryPayload[]>([])

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
    window.pretzel.getSettings().then((s) => {
      if (!s.hasSeenWalkthrough) setView('walkthrough')
    })
  }, [])

  useEffect(() => {
    window.pretzel.getRecentActivity().then(setActivity)
    window.pretzel.onActivityUpdate(setActivity)
  }, [])

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
    // Launch auto-check found a newer version — surface it without the user
    // asking (mac/linux path — no in-app auto-update, see auto-update.ts).
    window.pretzel.onUpdateAvailable(({ latest }) => setUpdate({ kind: 'available', latest, canAutoUpdate: false }))
    // win32's real electron-updater lifecycle — checking/available/
    // downloading/downloaded/error, including progress.
    window.pretzel.onAutoUpdateStatus((event) => {
      switch (event.kind) {
        case 'checking': setUpdate({ kind: 'checking' }); break
        case 'available': setUpdate({ kind: 'available', latest: event.version, canAutoUpdate: true }); break
        case 'not-available': break // launch check found nothing new — stay quiet, same as before
        case 'downloading': setUpdate({ kind: 'downloading', percent: event.percent }); break
        case 'downloaded': setUpdate({ kind: 'downloaded' }); break
        case 'error': setUpdate({ kind: 'error' }); break
      }
    })
  }, [])

  async function handleCheckForUpdate() {
    setUpdate({ kind: 'checking' })
    try {
      const r = await window.pretzel.checkForUpdate()
      if (r.updateAvailable && r.latest) {
        setUpdate({ kind: 'available', latest: r.latest, canAutoUpdate: r.autoUpdateSupported })
      } else {
        setUpdate({ kind: 'current', version: r.current })
      }
    } catch {
      setUpdate({ kind: 'error' })
    }
  }

  function handleDownloadUpdate() {
    if (update.kind !== 'available') return
    if (update.canAutoUpdate) {
      setUpdate({ kind: 'downloading', percent: 0 })
      window.pretzel.downloadUpdate()
    } else {
      window.pretzel.openDownloadPage()
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

  function finishWalkthrough() {
    window.pretzel.setSettings({ hasSeenWalkthrough: true })
    setView('status')
  }

  if (view === 'walkthrough') {
    return <WalkthroughView onDone={finishWalkthrough} />
  }
  if (view === 'settings') {
    return (
      <SettingsView
        onBack={() => setView('status')}
        onReplayWalkthrough={() => setView('walkthrough')}
      />
    )
  }

  const policyLabel = status.policyAvailable ? 'Policy active' : 'No policy cached'
  const policyInfo = status.policyAvailable
    ? "Pretzel has your organisation's rules loaded and is checking traffic against them."
    : "Pretzel doesn't have your organisation's rules yet — sign in to load them. Until then, nothing is checked."
  const sysProxyLabel = status.systemProxyActive
    ? 'System proxy active'
    : 'System proxy inactive'
  const sysProxyInfo = status.systemProxyActive
    ? 'Pretzel is actively watching traffic on this device.'
    : "Pretzel isn't watching traffic yet — sign in to turn it on."

  return (
    <div className="app fade-in">
      <div className="header">
        <div className="logo-wrap">
          <Logo size={30} />
          <span className={`logo-status-dot ${status.proxyRunning ? 'dot-safe' : 'dot-danger'}`} />
        </div>
        <div className="header-text">
          <div className="title">Pretzel Desktop</div>
          <div className="eyebrow">AI prompt protection</div>
        </div>
        <button className="gear-btn" onClick={() => setView('settings')} aria-label="Settings" title="Settings">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2.3" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
            />
          </svg>
        </button>
        <button className="close-btn" onClick={() => window.pretzel.hideWindow()} aria-label="Close" title="Close">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="status-card">
        <div className="status-row">
          <span className="status-row-label">{policyLabel}</span>
          <span className={`pill ${status.policyAvailable ? 'pill-safe' : 'pill-muted'}`}>
            <span className={`dot ${status.policyAvailable ? 'dot-safe' : 'dot-warn'}`} />
            {status.policyAvailable ? 'Active' : 'Waiting'}
          </span>
          <InfoIcon title={policyInfo} />
        </div>
        <div className="status-row">
          <span className="status-row-label">{sysProxyLabel}</span>
          <span className={`pill ${status.systemProxyActive ? 'pill-safe' : 'pill-muted'}`}>
            <span className={`dot ${status.systemProxyActive ? 'dot-safe' : 'dot-warn'}`} />
            {status.systemProxyActive ? 'Active' : 'Off'}
          </span>
          <InfoIcon title={sysProxyInfo} />
        </div>
      </div>

      <ActivityFeed entries={activity} />

      {showSignIn && (
        <div className="nag-card fade-in">
          <p className="nag-title">Protection is off until you sign in</p>
          <p className="nag-body">
            Nothing sent to ChatGPT, Claude, or Gemini is being checked right now — Pretzel has no rules loaded.
            Signing in takes about 10 seconds and loads your organisation's policy.
          </p>
          {authError && <p className="nag-error">{authError}</p>}
          <button
            className="btn btn-primary btn-block"
            onClick={handleSignIn}
            disabled={signingIn}
          >
            {signingIn ? 'Opening browser…' : 'Sign in with mykka.ai'}
          </button>
          {showCancelHint && (
            <div className="cancel-hint fade-in">
              <p>Still waiting — didn't see a browser open?</p>
              <button className="link-btn" onClick={handleCancelSignIn}>
                Cancel and try again
              </button>
            </div>
          )}
        </div>
      )}

      <div className="footer">
        {update.kind === 'available' && (
          <div className="update-available-card fade-in">
            <p className="update-available-title">
              <span className="dot dot-warn" />
              Version {update.latest} available
            </p>
            <button className="btn btn-primary btn-block" onClick={handleDownloadUpdate}>
              Download update
            </button>
          </div>
        )}
        {update.kind === 'downloading' && (
          <div className="update-available-card fade-in">
            <p className="update-available-title">Downloading update — {update.percent}%</p>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${update.percent}%` }} />
            </div>
          </div>
        )}
        {update.kind === 'downloaded' && (
          <div className="update-available-card fade-in">
            <p className="update-available-title">
              <span className="dot dot-safe" />
              Update ready — restart to install
            </p>
            <button className="btn btn-safe btn-block" onClick={() => window.pretzel.installUpdate()}>
              Restart & install
            </button>
          </div>
        )}
        {(update.kind === 'idle' || update.kind === 'checking' || update.kind === 'current' || update.kind === 'error') && (
          <div className="update-row">
            <span className="update-text">
              {update.kind === 'checking' && 'Checking…'}
              {update.kind === 'current' && `Up to date — ${update.version}`}
              {update.kind === 'error' && "Couldn't check — try again"}
              {update.kind === 'idle' && 'Check for updates'}
            </span>
            <button
              className="btn btn-outline btn-check"
              onClick={handleCheckForUpdate}
              disabled={update.kind === 'checking'}
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
