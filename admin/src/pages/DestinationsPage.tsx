import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { EntityModal } from '../components/ui/EntityModal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useDestinationGroups, useDestinationGroupMutations } from '../hooks/useDestinationGroups'
import type { DestinationGroup } from '../types'

const blank = { name: '', domains: '' }

function GroupForm({ value, onChange }: { value: typeof blank; onChange: (v: typeof blank) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          value={value.name}
          onChange={e => onChange({ ...value, name: e.target.value })}
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Domains (one per line)</label>
        <textarea
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
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
    <>
      <PageHeader
        title="Destination Groups"
        action={
          <button onClick={openNew} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            + New group
          </button>
        }
      />

      {isLoading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : groups.length === 0 ? (
        <EmptyState
          title="No destination groups"
          description="Group LLM destinations together to apply rules to sets of sites."
          action={{ label: '+ New group', onClick: openNew }}
        />
      ) : (
        <div className="grid gap-3">
          {groups.map(g => (
            <div key={g.id} className="flex items-start justify-between p-4 bg-white border border-gray-200 rounded-xl">
              <div>
                <div className="font-medium text-gray-900">{g.name}</div>
                <div className="text-sm text-gray-500 mt-0.5">{g.domains.join(', ') || 'No domains'}</div>
              </div>
              <div className="flex gap-3 shrink-0 ml-4">
                <button onClick={() => openEdit(g)} className="text-sm text-blue-600 hover:text-blue-800">Edit</button>
                <button onClick={() => setDeleting(g)} className="text-sm text-red-500 hover:text-red-700">Delete</button>
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
    </>
  )
}
