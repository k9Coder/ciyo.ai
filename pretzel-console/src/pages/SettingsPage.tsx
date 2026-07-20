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
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 24, maxWidth: 560,
    display: 'flex', flexDirection: 'column', gap: 16,
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13,
  }

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px',
    fontSize: 13, background: 'var(--bg-base)', color: 'var(--text-primary)',
  }

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Settings" />

      {/* Organisation */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Organisation</h2>

        {isLoading && <InlineLoader />}
        {isError   && <p style={{ fontSize: 13, color: 'var(--status-danger)', margin: 0 }}>Could not load tenant info.</p>}

        {tenant && (
          <>
            {/* Name (editable) */}
            <div style={rowStyle}>
              <span style={{ color: 'var(--text-secondary)' }}>Name</span>
              {editingName ? (
                <form onSubmit={saveName} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={nameValue} onChange={e => setNameValue(e.target.value)}
                    autoFocus style={inputStyle}
                  />
                  <button
                    type="submit" disabled={updateName.isPending}
                    style={{
                      background: 'var(--brand-primary)', color: '#fff', border: 'none',
                      borderRadius: 6, padding: '5px 12px', fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    {updateName.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button" onClick={() => setEditingName(false)}
                    style={{
                      background: 'transparent', border: '1px solid var(--border)',
                      color: 'var(--text-muted)', borderRadius: 6,
                      padding: '5px 12px', fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{tenant.name}</span>
                  <button
                    onClick={startEditName}
                    style={{
                      background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                      padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)',
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
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{
                  color: 'var(--text-primary)', fontWeight: 500, textTransform: 'capitalize',
                  fontFamily: mono ? 'monospace' : undefined,
                }}>
                  {value}
                </span>
              </div>
            ))}

            {/* Subscription status */}
            <div style={rowStyle}>
              <span style={{ color: 'var(--text-secondary)' }}>Subscription status</span>
              <span style={{
                color: tenant.subscriptionStatus === 'active'   ? 'var(--status-safe)'   :
                       tenant.subscriptionStatus === 'past_due' ? 'var(--status-warn)'   : 'var(--status-danger)',
                fontWeight: 600, textTransform: 'capitalize',
              }}>
                {tenant.subscriptionStatus.replace('_', ' ')}
              </span>
            </div>

            {/* Fail mode */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Extension fail mode</span>
                <select
                  value={tenant.failMode}
                  disabled={updateFailMode.isPending}
                  onChange={e => updateFailMode.mutate(e.target.value as 'open' | 'closed')}
                  style={{
                    border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px',
                    fontSize: 12, background: 'var(--bg-base)', color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="open">Fail open (allow on error)</option>
                  <option value="closed">Fail closed (block on error)</option>
                </select>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Controls extension behaviour when policy cannot be fetched.{' '}
                <strong style={{ color: 'var(--text-primary)' }}>Fail open</strong> lets prompts through;{' '}
                <strong style={{ color: 'var(--text-primary)' }}>fail closed</strong> blocks them.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Pilot status card */}
      {billing && billing.plan === 'pilot' && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Pilot Program</h2>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase',
              color: '#10b981', background: 'color-mix(in srgb, #10b981 12%, transparent)',
              border: '1px solid color-mix(in srgb, #10b981 30%, transparent)',
              borderRadius: 4, padding: '2px 6px',
            }}>Active</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            All Pretzel features are available at no cost during the pilot period.
          </p>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Seats</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {billing.seatCount} / {billing.seatLimit === -1 ? '∞' : billing.seatLimit}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>AI prompts today</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {billing.assistantLimits.promptsUsedToday} / {billing.assistantLimits.promptsPerDay === -1 ? '∞' : billing.assistantLimits.promptsPerDay}
            </span>
          </div>
          <div style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 6,
            background: 'color-mix(in srgb, #10b981 6%, var(--bg-surface-raised))',
            border: '1px solid color-mix(in srgb, #10b981 15%, transparent)',
            fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5,
          }}>
            When the pilot ends, this account moves to the <strong style={{ color: 'var(--text-primary)' }}>Free plan</strong> automatically.{' '}
            No credit card required — ever — unless you choose to upgrade.
          </div>
        </div>
      )}

      {/* Billing */}
      {billing && billing.plan !== 'pilot' && (
        <div style={sectionStyle}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Billing</h2>

          {/* Plan + status */}
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Plan</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, textTransform: 'capitalize' }}>
              {billing.plan}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Status</span>
            <span style={{
              fontWeight: 600, textTransform: 'capitalize',
              color: billing.subscriptionStatus === 'active'   ? 'var(--status-safe)'   :
                     billing.subscriptionStatus === 'past_due' ? 'var(--status-warn)'   : 'var(--status-danger)',
            }}>
              {billing.subscriptionStatus.replace('_', ' ')}
            </span>
          </div>

          {/* Trial countdown */}
          {billing.trialEndsAt && new Date(billing.trialEndsAt) > new Date() && (
            <div style={{
              background: 'color-mix(in srgb, var(--brand-primary) 8%, var(--bg-surface-raised))',
              border: '1px solid color-mix(in srgb, var(--brand-primary) 20%, transparent)',
              borderRadius: 8, padding: '8px 12px', fontSize: 12,
            }}>
              <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>Trial active</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                Ends {new Date(billing.trialEndsAt).toLocaleDateString()}
              </span>
            </div>
          )}

          {/* Seat usage */}
          <div>
            <div style={{ ...rowStyle, marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Seats used</span>
              <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 500 }}>
                {billing.seatCount} / {billing.seatLimit === -1 ? '∞' : billing.seatLimit}
              </span>
            </div>
          </div>

          {/* Scan usage */}
          <div>
            <div style={{ ...rowStyle, marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Scans this month</span>
              <span style={{
                color: billing.scanBlocked ? 'var(--status-danger)' : 'var(--text-primary)',
                fontSize: 12, fontWeight: 500,
              }}>
                {billing.monthlyScans.toLocaleString()} / {billing.scanLimit === -1 ? '∞' : billing.scanLimit.toLocaleString()}
              </span>
            </div>
            {billing.scanLimit > 0 && (
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3, transition: 'width 0.3s',
                  width: `${Math.min(100, Math.round((billing.monthlyScans / billing.scanLimit) * 100))}%`,
                  background: billing.scanBlocked ? 'var(--status-danger)' :
                               billing.monthlyScans / billing.scanLimit >= 0.8 ? '#f59e0b' : 'var(--status-safe)',
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
                padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                color: 'var(--brand-primary)',
                background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',
                borderRadius: 7, alignSelf: 'flex-start',
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
                padding: '8px 16px', fontSize: 13, fontWeight: 600,
                color: 'var(--brand-primary)',
                background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',
                borderRadius: 7, alignSelf: 'flex-start', textDecoration: 'none',
              }}
            >
              Upgrade plan →
            </a>
          )}
        </div>
      )}

      {/* API Tokens */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>API Tokens</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
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
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Desktop Agent</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          Pretzel Desktop monitors all apps system-wide — not just the browser. Intercepts Chrome, Edge, Safari, and native AI tools via a local HTTPS proxy.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* macOS */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>🍎 macOS</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Apple Silicon + Intel · macOS 12+</div>
            </div>
            <a
              href="https://mykka.ai/download"
              target="_blank"
              rel="noreferrer"
              style={{
                background: 'var(--brand-primary)', color: '#fff',
                border: 'none', borderRadius: 8, padding: '6px 16px',
                fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              Download .dmg
            </a>
          </div>

          {/* Windows */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>🪟 Windows</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Windows 10 / 11 (64-bit)</div>
            </div>
            <a
              href="https://mykka.ai/download"
              target="_blank"
              rel="noreferrer"
              style={{
                background: 'var(--brand-primary)', color: '#fff',
                border: 'none', borderRadius: 8, padding: '6px 16px',
                fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              Download .exe
            </a>
          </div>

          {/* Linux */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>🐧 Linux</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>AppImage (x64)</div>
            </div>
            <a
              href="https://mykka.ai/download"
              target="_blank"
              rel="noreferrer"
              style={{
                background: 'var(--bg-surface-raised)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 8, padding: '6px 16px',
                fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              Download .AppImage
            </a>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Quick install</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>macOS (Homebrew)</div>
              <code style={{
                display: 'block', background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--brand-secondary)',
                userSelect: 'all', cursor: 'text',
              }}>
                brew install --cask pretzel-desktop
              </code>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Windows (winget)</div>
              <code style={{
                display: 'block', background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--brand-secondary)',
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
          style={{ fontSize: 13, color: 'var(--brand-primary)', textDecoration: 'none', alignSelf: 'flex-start' }}
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
      background: 'var(--bg-base)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
        </div>
        <button
          onClick={onRotate} disabled={isPending}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)',
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
      background: 'rgba(0,180,80,0.08)', border: '1px solid rgba(0,180,80,0.25)',
      borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--status-safe)', fontWeight: 600 }}>
        New token generated. Copy it now — it will not be shown again.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code style={{
          flex: 1, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all',
          color: 'var(--text-primary)', background: 'var(--bg-surface)',
          padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)',
        }}>
          {token}
        </code>
        <button
          onClick={copy}
          style={{
            background: copied ? 'var(--status-safe)' : 'var(--brand-primary)',
            color: '#fff', border: 'none', borderRadius: 6,
            padding: '5px 12px', fontSize: 12, cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            padding: '5px 10px', fontSize: 12, cursor: 'pointer',
            color: 'var(--text-muted)', flexShrink: 0,
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
