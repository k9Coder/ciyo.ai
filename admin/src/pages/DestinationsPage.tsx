import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { EntityModal } from '../components/ui/EntityModal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useDestinationGroups, useDestinationGroupMutations } from '../hooks/useDestinationGroups'
import type { DestinationGroup } from '../types'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg-surface-raised)',
  color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4,
}

const blank = { name: '', domains: '' }

function GroupForm({ value, onChange }: { value: typeof blank; onChange: (v: typeof blank) => void }) {
  return (
    <>
      <div>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={value.name}
          onChange={e => onChange({ ...value, name: e.target.value })} autoFocus />
      </div>
      <div>
        <label style={labelStyle}>Domains (one per line)</label>
        <textarea
          style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
          rows={4}
          value={value.domains}
          onChange={e => onChange({ ...value, domains: e.target.value })}
          placeholder={"chatgpt.com\nclaude.ai\ngemini.google.com"}
        />
      </div>
    </>
  )
}

export function DestinationsPage() {
  const { data: groups = [], isLoading } = useDestinationGroups()
  const mutations = useDestinationGroupMutations()
  const [modal, setModal] = useState<{ open: boolean; editing: DestinationGroup | null; form: typeof blank }>({
    open: false, editing: null, form: blank,
  })
  const [deleting, setDeleting] = useState<DestinationGroup | null>(null)

  function openNew() { setModal({ open: true, editing: null, form: blank }) }
  function openEdit(g: DestinationGroup) {
    setModal({ open: true, editing: g, form: { name: g.name, domains: g.domains.join('\n') } })
  }
  function closeModal() { setModal(m => ({ ...m, open: false })) }

  async function handleSave() {
    const domains = modal.form.domains.split('\n').map(s => s.trim()).filter(Boolean)
    if (modal.editing) {
      await mutations.update.mutateAsync({ id: modal.editing.id, data: { name: modal.form.name, domains } })
    } else {
      await mutations.create.mutateAsync({ name: modal.form.name, domains })
    }
    closeModal()
  }

  return (
    <div style={{ padding: '16px 24px' }}>
      <PageHeader
        title="Destination Groups"
        action={
          <button
            onClick={openNew}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, color: 'var(--bg-base)',
                     background: 'var(--brand-primary)', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            + New group
          </button>
        }
      />

      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
      ) : groups.length === 0 ? (
        <EmptyState
          title="No destination groups"
          description="Group LLM destinations together to apply rules to sets of sites."
          action={{ label: '+ New group', onClick: openNew }}
        />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {groups.map(g => (
            <div key={g.id} style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              padding: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{g.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {g.domains.join(', ') || 'No domains'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexShrink: 0, marginLeft: 16 }}>
                <button onClick={() => openEdit(g)} style={{ fontSize: 13, color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
                <button onClick={() => setDeleting(g)} style={{ fontSize: 13, color: 'var(--status-danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <EntityModal
        open={modal.open}
        title={modal.editing ? 'Edit group' : 'New destination group'}
        onClose={closeModal}
        onSave={handleSave}
        saving={mutations.create.isPending || mutations.update.isPending}
      >
        <GroupForm value={modal.form} onChange={form => setModal(m => ({ ...m, form }))} />
      </EntityModal>

      <ConfirmModal
        open={!!deleting}
        message={`Delete destination group "${deleting?.name}"?`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { await mutations.remove.mutateAsync(deleting!.id); setDeleting(null) }}
        confirming={mutations.remove.isPending}
      />
    </div>
  )
}
