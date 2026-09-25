import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { useTenant, useTenantMutations } from '../hooks/useTenant'
import { useBilling, useBillingMutations } from '../hooks/useBilling'
import { InlineLoader } from '../components/ui/Spinner'

export function SettingsPage() {
  const { data: tenant, isLoading, isError } = useTenant()
  const { updateName, rotateOrgToken, rotateAdminToken, updateFailMode } = useTenantMutations()
  const { data: billing } = useBilling()
  const { openPortal } = useBillingMutations()

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue]     = useState('')

  const [newOrgToken, setNewOrgToken]     = useState<string | null>(null)
  const [newAdminToken, setNewAdminToken] = useState<string | null>(null)

  function startEditName() {
    setNameValue(tenant?.name ?? '')
    setEditingName(true)
  }

  function saveName(e: React.FormEvent) {
    e.preventDefault()
    if (!nameValue.trim()) return
    updateName.mutate(nameValue.trim(), { onSuccess: () => setEditingName(false) })
  }

  function handleRotateOrg() {
    if (!window.confirm('Rotate the org token? All devices using the current token will stop working until updated.')) return
    rotateOrgToken.mutate(undefined, { onSuccess: data => setNewOrgToken(data.token) })
  }

  function handleRotateAdmin() {
    if (!window.confirm('Rotate the admin token? The current admin token will stop working immediately.')) return
    rotateAdminToken.mutate(undefined, { onSuccess: data => setNewAdminToken(data.token) })
  }

  const sectionStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--line)',
    borderRadius: 'var(--r)', padding: 24, maxWidth: 560,
    display: 'flex', flexDirection: 'column', gap: 16,
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15,
  }

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '5px 10px',
    fontSize: 15, background: 'var(--bg)', color: 'var(--ink)',
  }

  return (
    <div style={{ padding: '32px 36px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Settings" />

      {/* Organisation */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Organisation</h2>

        {isLoading && <InlineLoader />}
        {isError   && <p style={{ fontSize: 15, color: 'var(--block)', margin: 0 }}>Could not load tenant info.</p>}

        {tenant && (
          <>
            {/* Name (editable) */}
            <div style={rowStyle}>
              <span style={{ color: 'var(--muted)' }}>Name</span>
              {editingName ? (
                <form onSubmit={saveName} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={nameValue} onChange={e => setNameValue(e.target.value)}
                    autoFocus style={inputStyle}
                  />
                  <button
                    type="submit" disabled={updateName.isPending}
                    style={{
                      background: 'var(--btn-bg)', color: 'var(--btn-fg)', border: 'none',
                      borderRadius: 'var(--r-btn)', padding: '5px 12px', fontSize: 15, cursor: 'pointer',
                    }}
                  >
                    {updateName.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button" onClick={() => setEditingName(false)}
                    style={{
                      background: 'transparent', border: '1px solid var(--line)',
                      color: 'var(--muted)', borderRadius: 'var(--r-btn)',
                      padding: '5px 12px', fontSize: 15, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{tenant.name}</span>
                  <button
                    onClick={startEditName}
                    style={{
                      background: 'none', border: '1px solid var(--line)', borderRadius: 'var(--r-btn)',
                      padding: '3px 10px', fontSize: 14, cursor: 'pointer', color: 'var(--muted)',
                    }}
                  >
                    Edit
                  </button>
                </span>
              )}
            </div>

            {/* Read-only rows */}
            {([
              ['Plan', tenant.plan,  false],
            ] as [string, string, boolean][]).map(([label, value, mono]) => (
              <div key={label} style={rowStyle}>
                <span style={{ color: 'var(--muted)' }}>{label}</span>
                <span style={{
                  color: 'var(--ink)', fontWeight: 500, textTransform: 'capitalize',
                  fontFamily: mono ? 'monospace' : undefined,
                }}>
                  {value}
                </span>
              </div>
            ))}

            {/* Subscription status */}
            <div style={rowStyle}>
              <span style={{ color: 'var(--muted)' }}>Subscription status</span>
              <span style={{
                color: tenant.subscriptionStatus === 'active'   ? 'var(--brand)'   :
                       tenant.subscriptionStatus === 'past_due' ? 'var(--warn)'   : 'var(--block)',
                fontWeight: 600, textTransform: 'capitalize',
              }}>
                {tenant.subscriptionStatus.replace('_', ' ')}
              </span>
            </div>

            {/* Fail mode */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--muted)', fontSize: 15 }}>Fail mode (extension &amp; desktop)</span>
                <select
                  value={tenant.failMode}
                  disabled={updateFailMode.isPending}
                  onChange={e => updateFailMode.mutate(e.target.value as 'open' | 'closed')}
                  style={{
                    border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '4px 8px',
                    fontSize: 14, background: 'var(--bg)', color: 'var(--ink)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="open">Fail open (allow on error)</option>
                  <option value="closed">Fail closed (block on error)</option>
                </select>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                Controls what happens when a check cannot complete: the policy cannot be fetched, the check errors,
                or (desktop) a warning prompt gets no answer in time.{' '}
                <strong style={{ color: 'var(--ink)' }}>Fail open</strong> lets prompts through;{' '}
                <strong style={{ color: 'var(--ink)' }}>fail closed</strong> blocks them.
                Rules set to block are always blocked when a prompt goes unanswered.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Pilot status card */}
      {billing && billing.plan === 'pilot' && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Pilot Program</h2>
            <span style={{
              fontSize: 13, fontWeight: 500,
              color: 'var(--brand)', background: 'var(--brand-soft)',
              borderRadius: 'var(--r-btn)', padding: '3px 10px',
            }}>Active</span>
          </div>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 12px' }}>
            All Pretzel features are available at no cost during the pilot period.
          </p>
          <div style={rowStyle}>
            <span style={{ color: 'var(--muted)' }}>Seats</span>
            <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
              {billing.seatCount} / {billing.seatLimit === -1 ? '∞' : billing.seatLimit}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--muted)' }}>AI prompts today</span>
            <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
              {billing.assistantLimits.promptsUsedToday} / {billing.assistantLimits.promptsPerDay === -1 ? '∞' : billing.assistantLimits.promptsPerDay}
            </span>
          </div>
          <div style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 'var(--r-sm)',
            background: 'var(--brand-soft)',
            fontSize: 14, color: 'var(--muted)', lineHeight: 1.5,
          }}>
            When the pilot ends, this account moves to the <strong style={{ color: 'var(--ink)' }}>Free plan</strong> automatically.{' '}
            No credit card required — ever — unless you choose to upgrade.
          </div>
        </div>
      )}

      {/* Billing */}
      {billing && billing.plan !== 'pilot' && (
        <div style={sectionStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Billing</h2>

          {/* Plan + status */}
          <div style={rowStyle}>
            <span style={{ color: 'var(--muted)' }}>Plan</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600, textTransform: 'capitalize' }}>
              {billing.plan}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--muted)' }}>Status</span>
            <span style={{
              fontWeight: 600, textTransform: 'capitalize',
              color: billing.subscriptionStatus === 'active'   ? 'var(--brand)'   :
                     billing.subscriptionStatus === 'past_due' ? 'var(--warn)'   : 'var(--block)',
            }}>
              {billing.subscriptionStatus.replace('_', ' ')}
            </span>
          </div>

          {/* Trial countdown */}
          {billing.trialEndsAt && new Date(billing.trialEndsAt) > new Date() && (
            <div style={{
              background: 'color-mix(in srgb, var(--brand) 8%, var(--fill))',
              border: '1px solid color-mix(in srgb, var(--brand) 20%, transparent)',
              borderRadius: 'var(--r-sm)', padding: '8px 12px', fontSize: 14,
            }}>
              <span style={{ color: 'var(--brand)', fontWeight: 600 }}>Trial active</span>
              <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                Ends {new Date(billing.trialEndsAt).toLocaleDateString()}
              </span>
            </div>
          )}

          {/* Seat usage */}
          <div>
            <div style={{ ...rowStyle, marginBottom: 6 }}>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>Seats used</span>
              <span style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500 }}>
                {billing.seatCount} / {billing.seatLimit === -1 ? '∞' : billing.seatLimit}
              </span>
            </div>
          </div>

          {/* Scan usage */}
          <div>
            <div style={{ ...rowStyle, marginBottom: 6 }}>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>Scans this month</span>
              <span style={{
                color: billing.scanBlocked ? 'var(--block)' : 'var(--ink)',
                fontSize: 14, fontWeight: 500,
              }}>
                {billing.monthlyScans.toLocaleString()} / {billing.scanLimit === -1 ? '∞' : billing.scanLimit.toLocaleString()}
              </span>
            </div>
            {billing.scanLimit > 0 && (
              <div style={{ height: 6, background: 'var(--line)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 'var(--r-sm)', transition: 'width 0.3s',
                  width: `${Math.min(100, Math.round((billing.monthlyScans / billing.scanLimit) * 100))}%`,
                  background: billing.scanBlocked ? 'var(--block)' :
                               billing.monthlyScans / billing.scanLimit >= 0.8 ? 'var(--warn)' : 'var(--brand)',
                }} />
              </div>
            )}
          </div>

          {/* Actions */}
          {billing.paymentProvider === 'stripe' && (
            <button
              onClick={() => openPortal.mutate(window.location.href)}
              disabled={openPortal.isPending}
              style={{
                padding: '8px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                color: 'var(--brand)',
                background: 'color-mix(in srgb, var(--brand) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--brand) 30%, transparent)',
                borderRadius: 'var(--r-btn)', alignSelf: 'flex-start',
              }}
            >
              {openPortal.isPending ? 'Redirecting…' : 'Manage subscription →'}
            </button>
          )}
          {!billing.paymentProvider && billing.plan === 'free' && (
            <a
              href="https://mykka.ai/pricing"
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '8px 16px', fontSize: 15, fontWeight: 600,
                color: 'var(--brand)',
                background: 'color-mix(in srgb, var(--brand) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--brand) 30%, transparent)',
                borderRadius: 'var(--r-sm)', alignSelf: 'flex-start', textDecoration: 'none',
              }}
            >
              Upgrade plan →
            </a>
          )}
        </div>
      )}

      {/* API Tokens */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>API Tokens</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
          Rotating a token immediately invalidates the current one.
          Copy the new token when shown — it will not be displayed again.
        </p>

        <TokenCard
          title="Org Token"
          description="Deployed to member devices via MDM or manual config"
          isPending={rotateOrgToken.isPending}
          onRotate={handleRotateOrg}
          newToken={newOrgToken}
          onDismiss={() => setNewOrgToken(null)}
        />
        <TokenCard
          title="Admin Token"
          description="Used by this admin dashboard and CI/CD integrations"
          isPending={rotateAdminToken.isPending}
          onRotate={handleRotateAdmin}
          newToken={newAdminToken}
          onDismiss={() => setNewAdminToken(null)}
        />
      </div>

      {/* Desktop Agent */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Desktop Agent</h2>
        <p style={{ fontSize: 15, color: 'var(--muted)', margin: 0 }}>
          Pretzel Desktop monitors all apps system-wide — not just the browser. Intercepts Chrome, Edge, Safari, and native AI tools via a local HTTPS proxy.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* macOS */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>🍎 macOS</div>
              <div style={{ fontSize: 14, color: 'var(--muted)' }}>Apple Silicon + Intel · macOS 12+</div>
            </div>
            <a
              href="https://mykka.ai/download"
              target="_blank"
              rel="noreferrer"
              style={{
                background: 'var(--btn-bg)', color: 'var(--btn-fg)',
                border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 16px',
                fontSize: 15, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              Download .dmg
            </a>
          </div>

          {/* Windows */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>🪟 Windows</div>
              <div style={{ fontSize: 14, color: 'var(--muted)' }}>Windows 10 / 11 (64-bit)</div>
            </div>
            <a
              href="https://mykka.ai/download"
              target="_blank"
              rel="noreferrer"
              style={{
                background: 'var(--btn-bg)', color: 'var(--btn-fg)',
                border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 16px',
                fontSize: 15, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              Download .exe
            </a>
          </div>

          {/* Linux */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>🐧 Linux</div>
              <div style={{ fontSize: 14, color: 'var(--muted)' }}>AppImage (x64)</div>
            </div>
            <a
              href="https://mykka.ai/download"
              target="_blank"
              rel="noreferrer"
              style={{
                background: 'var(--fill)', color: 'var(--ink)',
                border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '6px 16px',
                fontSize: 15, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              Download .AppImage
            </a>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>Quick install</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 3 }}>macOS (Homebrew)</div>
              <code style={{
                display: 'block', background: 'var(--bg)', border: '1px solid var(--line)',
                borderRadius: 'var(--r-sm)', padding: '6px 10px', fontSize: 14, color: 'var(--brand-secondary)',
                userSelect: 'all', cursor: 'text',
              }}>
                brew install --cask pretzel-desktop
              </code>
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 3 }}>Windows (winget)</div>
              <code style={{
                display: 'block', background: 'var(--bg)', border: '1px solid var(--line)',
                borderRadius: 'var(--r-sm)', padding: '6px 10px', fontSize: 14, color: 'var(--brand-secondary)',
                userSelect: 'all', cursor: 'text',
              }}>
                winget install mykka.PretzelDesktop
              </code>
            </div>
          </div>
        </div>

        <a
          href="https://mykka.ai/download"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 15, color: 'var(--brand)', textDecoration: 'none', alignSelf: 'flex-start' }}
        >
          View all platforms and release notes →
        </a>
      </div>
    </div>
  )
}

function TokenCard({
  title, description, isPending, onRotate, newToken, onDismiss,
}: {
  title: string; description: string; isPending: boolean
  onRotate: () => void; newToken: string | null; onDismiss: () => void
}) {
  return (
    <div style={{
      background: 'var(--bg)', border: '1px solid var(--line)',
      borderRadius: 'var(--r-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{description}</div>
        </div>
        <button
          onClick={onRotate} disabled={isPending}
          style={{
            background: 'none', border: '1px solid var(--line)', borderRadius: 'var(--r-btn)',
            padding: '5px 12px', fontSize: 14, cursor: 'pointer', color: 'var(--muted)',
            opacity: isPending ? 0.5 : 1,
          }}
        >
          {isPending ? 'Rotating…' : 'Rotate'}
        </button>
      </div>
      {newToken && <NewTokenBanner token={newToken} onDismiss={onDismiss} />}
    </div>
  )
}

function NewTokenBanner({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(token).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{
      background: 'var(--brand-soft)',
      borderRadius: 'var(--r-sm)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--brand)', fontWeight: 600 }}>
        New token generated. Copy it now — it will not be shown again.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code style={{
          flex: 1, fontFamily: 'var(--mono)', fontSize: 13, wordBreak: 'break-all',
          color: 'var(--ink)', background: 'var(--surface)',
          padding: '4px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)',
        }}>
          {token}
        </code>
        <button
          onClick={copy}
          style={{
            background: 'var(--btn-bg)',
            color: 'var(--btn-fg)', border: 'none', borderRadius: 'var(--r-btn)',
            padding: '5px 12px', fontSize: 14, cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: '1px solid var(--line)', borderRadius: 'var(--r-btn)',
            padding: '5px 10px', fontSize: 14, cursor: 'pointer',
            color: 'var(--muted)', flexShrink: 0,
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
