import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { EntityModal } from '../components/ui/EntityModal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useSiteConfigs, useSiteConfigMutations } from '../hooks/useSiteConfigs'
import type { SiteConfig } from '../types'

const blank = { domain: '', inputSelector: '', sendButtonSelector: '' }

function SiteForm({ value, onChange }: { value: typeof blank; onChange: (v: typeof blank) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          value={value.domain}
          onChange={e => onChange({ ...value, domain: e.target.value })}
          placeholder="chat.openai.com"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Input selector (CSS)</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          value={value.inputSelector}
          onChange={e => onChange({ ...value, inputSelector: e.target.value })}
          placeholder="#prompt-textarea"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Send button selector (CSS)</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          value={value.sendButtonSelector}
          onChange={e => onChange({ ...value, sendButtonSelector: e.target.value })}
          placeholder="button[data-testid='send-button']"
        />
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
          <button onClick={openNew} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            + New site
          </button>
        }
      />

      {isLoading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : configs.length === 0 ? (
        <EmptyState
          title="No site configs"
          description="Add custom CSS selectors for sites not covered by built-in adapters."
          action={{ label: '+ New site', onClick: openNew }}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Input selector</th>
                <th className="px-4 py-3">Send button selector</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {configs.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">{c.domain}</td>
                  <td className="px-4 py-3 font-mono text-gray-600 max-w-xs truncate">{c.inputSelector}</td>
                  <td className="px-4 py-3 font-mono text-gray-600 max-w-xs truncate">{c.sendButtonSelector}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => openEdit(c)} className="text-blue-600 hover:text-blue-800">Edit</button>
                      <button onClick={() => setDeleting(c)} className="text-red-500 hover:text-red-700">Delete</button>
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
