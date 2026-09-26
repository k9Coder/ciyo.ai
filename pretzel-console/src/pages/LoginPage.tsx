import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SignIn, SignUp, useAuth } from '@clerk/react'
import { Spinner } from '../components/ui/Spinner'
import { PretzelLogo } from '../components/layout/PretzelLogo'
import { getTheme, setTheme, type Theme } from '../utils/theme'
import '../styles/login.css'

const SIGN_IN_PATH = '/login'
const SIGN_UP_PATH = '/login/sign-up'

/** Only same-origin paths: the `redirect` param must never bounce the user off-site. */
function safeRedirect(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard'
}

/**
 * Clerk's embedded form, themed to the mykka design through CSS variables so it follows
 * the light/dark toggle without re-rendering. The page draws its own heading on the first
 * step of each flow (see `onRoot`), so Clerk's header is hidden there and left visible on
 * later steps ("Check your email", password, …) where its wording is step-specific.
 */
function appearance(onRoot: boolean) {
  const hide = { display: 'none' }
  return {
    variables: {
      colorPrimary: 'var(--brand)',
      colorText: 'var(--ink)',
      colorTextSecondary: 'var(--muted)',
      colorBackground: 'var(--bg)',
      colorInputBackground: 'var(--surface)',
      colorInputText: 'var(--ink)',
      colorDanger: 'var(--block)',
      borderRadius: 'var(--r-sm)',
      fontFamily: 'var(--font)',
    },
    elements: {
      rootBox: { width: '100%' },
      cardBox: { width: '100%', maxWidth: '100%', boxShadow: 'none', border: 'none', background: 'transparent' },
      card: { boxShadow: 'none', border: 'none', background: 'transparent', padding: 0, gap: 24 },
      logoBox: hide,
      header: onRoot ? hide : { textAlign: 'left', alignItems: 'flex-start' },
      headerTitle: onRoot
        ? hide
        : { fontSize: 32, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.1, color: 'var(--ink)' },
      headerSubtitle: onRoot ? hide : { fontSize: 16, color: 'var(--muted)', lineHeight: 1.5 },
      footer: hide,
      socialButtonsBlockButton: {
        background: 'var(--surface)',
        color: 'var(--ink)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-btn)',
        padding: 12,
        boxShadow: 'none',
        fontSize: 15,
        fontWeight: 500,
        '&:hover': { borderColor: 'var(--ink)', background: 'var(--surface)' },
      },
      socialButtonsBlockButtonText: { fontWeight: 500, color: 'var(--ink)' },
      dividerLine: { background: 'var(--line)' },
      dividerText: { color: 'var(--muted)', fontSize: 13 },
      formFieldLabel: { fontSize: 14, fontWeight: 500, color: 'var(--ink)' },
      formFieldInput: {
        background: 'var(--surface)',
        color: 'var(--ink)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-sm)',
        padding: '12px 14px',
        fontSize: 15,
        boxShadow: 'none',
        '&::placeholder': { color: 'var(--muted)' },
        '&:focus': { borderColor: 'var(--brand)', boxShadow: '0 0 0 3px var(--brand-soft)' },
      },
      formFieldErrorText: { color: 'var(--block)', fontSize: 13 },
      otpCodeFieldInput: {
        height: 56,
        background: 'var(--surface)',
        color: 'var(--ink)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-sm)',
        fontFamily: 'var(--mono)',
        fontSize: 22,
        boxShadow: 'none',
        '&:focus': { borderColor: 'var(--brand)', boxShadow: '0 0 0 3px var(--brand-soft)' },
      },
      formButtonPrimary: {
        background: 'var(--btn-bg)',
        backgroundImage: 'none',
        color: 'var(--btn-fg)',
        borderRadius: 'var(--r-btn)',
        padding: 13,
        fontSize: 16,
        fontWeight: 500,
        textTransform: 'none',
        boxShadow: 'none',
        '&:hover, &:focus, &:active': { background: 'var(--btn-bg)', backgroundImage: 'none', opacity: 0.9, boxShadow: 'none' },
      },
      formResendCodeLink: { color: 'var(--ink)', textDecoration: 'underline', textUnderlineOffset: 3 },
      backLink: { color: 'var(--muted)' },
      identityPreview: { borderColor: 'var(--line)' },
      alert: { borderRadius: 'var(--r-sm)' },
    },
  }
}

function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>(getTheme)
  const pick = (next: Theme) => { setTheme(next); setLocal(next) }
  return (
    <button
      type="button"
      className="login-theme"
      aria-label="Switch theme"
      onClick={() => pick(theme === 'dark' ? 'light' : 'dark')}
    >
      <span data-active={theme === 'light'}>Light</span>
      <span data-active={theme === 'dark'}>Dark</span>
    </button>
  )
}

/** Product proof beside the form. Illustrative numbers, labelled as such. */
function ProofPanel() {
  return (
    <aside className="login-proof">
      <div className="login-proof-eyebrow">Northwind Legal · this week</div>
      <div className="login-proof-claim">Everyone is covered. 41 prompts were cleaned before they reached AI.</div>
      <div className="login-stats">
        <div className="login-stats-row">
          <div className="login-stat"><span className="login-stat-label">Coverage</span><span className="login-stat-value">48 / 48</span></div>
          <div className="login-stat"><span className="login-stat-label">Blocked</span><span className="login-stat-value">29</span></div>
          <div className="login-stat"><span className="login-stat-label">Warned</span><span className="login-stat-value">12</span></div>
        </div>
        <div className="login-stats-foot"><span className="login-dot" />Policy v14 is live on every device</div>
      </div>
      <span className="login-note">Example data. After sign-in you'll see your own.</span>
    </aside>
  )
}

export function LoginPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()

  const redirectTo = safeRedirect(new URLSearchParams(search).get('redirect'))
  const path = pathname.replace(/\/+$/, '')
  const isSignUp = path.startsWith(SIGN_UP_PATH)
  const onRoot = path === SIGN_IN_PATH || path === SIGN_UP_PATH
  // Keep the redirect target across the sign-in <-> sign-up switch. The switch is a full page
  // load (`reloadDocument`): Clerk's still-mounted <SignIn/> reacts to the URL change to
  // /login/sign-up by redirecting to the hosted account portal before it unmounts.
  const carry = search

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    navigate(redirectTo, { replace: true })
  }, [isLoaded, isSignedIn, navigate, redirectTo])

  return (
    <div className="login-shell">
      <div className="login-main">
        <div className="login-top">
          <PretzelLogo />
          <span className="login-wordmark">mykka</span>
          <span className="login-tag">Console</span>
          <span className="login-spacer" />
          <ThemeToggle />
        </div>

        <div className="login-center">
          <div className="login-card">
            {onRoot && (
              <div className="login-head">
                <h1>{isSignUp ? 'Set up Pretzel for your team' : 'Sign in to the console'}</h1>
                <p>
                  {isSignUp
                    ? "Create your admin account. Next you'll name your organization and pick a starting policy."
                    : "Use your work account. Your organization's policies, people and activity are waiting."}
                </p>
              </div>
            )}

            {!isLoaded ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                <Spinner size="md" />
              </div>
            ) : isSignUp ? (
              <SignUp
                routing="path"
                path={SIGN_UP_PATH}
                signInUrl={SIGN_IN_PATH}
                fallbackRedirectUrl={redirectTo}
                appearance={appearance(onRoot)}
              />
            ) : (
              <SignIn
                routing="path"
                path={SIGN_IN_PATH}
                signUpUrl={SIGN_UP_PATH}
                fallbackRedirectUrl={redirectTo}
                appearance={appearance(onRoot)}
              />
            )}

            {onRoot && isSignUp && (
              <span className="login-note">Pilot program: every feature is free, with no limits on people or scans.</span>
            )}
            {onRoot && (
              <div className="login-switch">
                {isSignUp ? (
                  <>Already have an account? <Link reloadDocument to={`${SIGN_IN_PATH}${carry}`}>Sign in</Link></>
                ) : (
                  <>New to Pretzel? <Link reloadDocument to={`${SIGN_UP_PATH}${carry}`}>Set up your organization</Link></>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="login-foot">
          <span className="login-secure">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Secure sign-in by Clerk
          </span>
          <span className="login-spacer" />
          <a href="https://mykka.ai/security">Security</a>
          <a href="https://mykka.ai/privacy">Privacy</a>
          <a href="mailto:hello@mykka.ai">Help</a>
        </div>
      </div>

      <ProofPanel />
    </div>
  )
}
