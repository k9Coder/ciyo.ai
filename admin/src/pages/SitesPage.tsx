import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { EntityModal } from '../components/ui/EntityModal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useSiteConfigs, useSiteConfigMutations } from '../hooks/useSiteConfigs'
import type { SiteConfig } from '../types'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg-surface-raised)',
  color: 'var(--text-primary)', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4,
}

const blank = { domain: '', inputSelector: '', sendButtonSelector: '' }

function SiteForm({ value, onChange }: { value: typeof blank; onChange: (v: typeof blank) => void }) {
  return (
    <>
      <div>
        <label style={labelStyle}>Domain</label>
        <input style={inputStyle} value={value.domain}
          onChange={e => onChange({ ...value, domain: e.target.value })}
          placeholder="chat.openai.com" autoFocus />
      </div>
      <div>
        <label style={labelStyle}>Input selector (CSS)</label>
        <input style={inputStyle} value={value.inputSelector}
          onChange={e => onChange({ ...value, inputSelector: e.target.value })}
          placeholder="#prompt-textarea" />
      </div>
      <div>
        <label style={labelStyle}>Send button selector (CSS)</label>
        <input style={inputStyle} value={value.sendButtonSelector}
          onChange={e => onChange({ ...value, sendButtonSelector: e.target.value })}
          placeholder="button[data-testid='send-button']" />
      </div>
    </>
  )
}

export function SitesPage() {
  const { data: configs = [], isLoading } = useSiteConfigs()
  const mutations = useSiteConfigMutations()
  const [modal, setModal] = useState<{ open: boolean; editing: SiteConfig | null; form: typeof blank }>({
    open: false, editing: null, form: blank,
  })
  const [deleting, setDeleting] = useState<SiteConfig | null>(null)

  function openNew() { setModal({ open: true, editing: null, form: blank }) }
  function openEdit(c: SiteConfig) {
    setModal({ open: true, editing: c, form: { domain: c.domain, inputSelector: c.inputSelector, sendButtonSelector: c.sendButtonSelector } })
  }
  function closeModal() { setModal(m => ({ ...m, open: false })) }

  async function handleSave() {
    const { domain, inputSelector, sendButtonSelector } = modal.form
    if (modal.editing) {
      await mutations.update.mutateAsync({ domain: modal.editing.domain, data: { inputSelector, sendButtonSelector } })
    } else {
      await mutations.create.mutateAsync({ domain, inputSelector, sendButtonSelector })
    }
    closeModal()
  }

  return (
    <>
      <PageHeader
        title="Site Configs"
        action={
          <button
            onClick={openNew}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, color: 'var(--bg-base)',
                     background: 'var(--brand-primary)', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            + New site
          </button>
        }
      />

      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
      ) : configs.length === 0 ? (
        <EmptyState
          title="No site configs"
          description="Add custom CSS selectors for sites not covered by built-in adapters."
          action={{ label: '+ New site', onClick: openNew }}
        />
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Domain', 'Input selector', 'Send button selector', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                                       letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {configs.map((c, i) => (
                <tr key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>{c.domain}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.inputSelector}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sendButtonSelector}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                      <button onClick={() => openEdit(c)} style={{ fontSize: 13, color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => setDeleting(c)} style={{ fontSize: 13, color: 'var(--status-danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EntityModal
        open={modal.open}
        title={modal.editing ? 'Edit site config' : 'New site config'}
        onClose={closeModal}
        onSave={handleSave}
        saving={mutations.create.isPending || mutations.update.isPending}
      >
        <SiteForm value={modal.form} onChange={form => setModal(m => ({ ...m, form }))} />
      </EntityModal>

      <ConfirmModal
        open={!!deleting}
        message={`Delete site config for "${deleting?.domain}"?`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { await mutations.remove.mutateAsync(deleting!.domain); setDeleting(null) }}
        confirming={mutations.remove.isPending}
      />
    </>
  )
}
