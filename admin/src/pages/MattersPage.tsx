import React, { useEffect, useState } from 'react'
import { api, AdminApiError, type Matter, type CreateMatterInput } from '../api'

type Status = { kind: 'idle' } | { kind: 'error'; msg: string } | { kind: 'success'; msg: string }

interface EditState {
  matterId: string
  clientName: string
  matterName: string
  matterNumber: string
  opposingParties: string
}

export function MattersPage() {
  const [matters, setMatters] = useState<Matter[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<EditState | null>(null)

  // Add form state
  const [addClient, setAddClient] = useState('')
  const [addMatterName, setAddMatterName] = useState('')
  const [addMatterNumber, setAddMatterNumber] = useState('')
  const [addOpposing, setAddOpposing] = useState('')

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    try {
      setMatters(await api.matters.list())
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Failed to load' })
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addClient.trim()) return
    try {
      const data: CreateMatterInput = {
        clientName: addClient.trim(),
        ...(addMatterName.trim() ? { matterName: addMatterName.trim() } : {}),
        ...(addMatterNumber.trim() ? { matterNumber: addMatterNumber.trim() } : {}),
        ...(addOpposing.trim()
          ? { opposingParties: addOpposing.split(',').map(s => s.trim()).filter(Boolean) }
          : {}),
      }
      const created = await api.matters.create(data)
      setMatters(prev => [created, ...prev])
      setAddClient(''); setAddMatterName(''); setAddMatterNumber(''); setAddOpposing('')
      setShowAdd(false)
      setStatus({ kind: 'success', msg: 'Matter added.' })
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Failed to add' })
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await api.matters.update(id, { active: false })
      setMatters(prev => prev.filter(m => m.id !== id))
      setStatus({ kind: 'success', msg: 'Matter deactivated.' })
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Failed' })
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    try {
      const updated = await api.matters.update(editing.matterId, {
        clientName: editing.clientName,
        matterName: editing.matterName || undefined,
        matterNumber: editing.matterNumber || undefined,
        opposingParties: editing.opposingParties
          ? editing.opposingParties.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      })
      setMatters(prev => prev.map(m => m.id === updated.id ? updated : m))
      setEditing(null)
      setStatus({ kind: 'success', msg: 'Matter updated.' })
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Failed' })
    }
  }

  const filtered = matters.filter(m =>
    m.clientName.toLowerCase().includes(search.toLowerCase()) ||
    (m.matterNumber ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Client Matters</h2>
          <p className="text-sm text-gray-500 mt-0.5">Active matters are compiled into the detection policy.</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          {showAdd ? 'Cancel' : '+ Add matter'}
        </button>
      </div>

      {status.kind !== 'idle' && (
        <div className={`p-3 rounded-lg text-sm border ${
          status.kind === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {status.msg}
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">New matter</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client name *</label>
              <input value={addClient} onChange={e => setAddClient(e.target.value)} required
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Matter number</label>
              <input value={addMatterNumber} onChange={e => setAddMatterNumber(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Matter name</label>
              <input value={addMatterName} onChange={e => setAddMatterName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Opposing parties (comma-separated)</label>
              <input value={addOpposing} onChange={e => setAddOpposing(e.target.value)}
                placeholder="Acme Inc, Widget Corp"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAdd(false)}
              className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit"
              className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              Add
            </button>
          </div>
        </form>
      )}

      <div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by client name or matter number…"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
        />

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400">{search ? 'No matches.' : 'No active matters. Add one above.'}</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(m => (
              <div key={m.id}>
                {editing?.matterId === m.id ? (
                  <form onSubmit={handleEdit} className="bg-white rounded-xl border border-blue-200 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Client name *</label>
                        <input value={editing.clientName}
                          onChange={e => setEditing(p => p && ({ ...p, clientName: e.target.value }))}
                          required className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Matter number</label>
                        <input value={editing.matterNumber}
                          onChange={e => setEditing(p => p && ({ ...p, matterNumber: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Matter name</label>
                        <input value={editing.matterName}
                          onChange={e => setEditing(p => p && ({ ...p, matterName: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Opposing parties</label>
                        <input value={editing.opposingParties}
                          onChange={e => setEditing(p => p && ({ ...p, opposingParties: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setEditing(null)}
                        className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                        Cancel
                      </button>
                      <button type="submit"
                        className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{m.clientName}</p>
                      <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-gray-500">
                        {m.matterNumber && <span>#{m.matterNumber}</span>}
                        {m.matterName && <span>{m.matterName}</span>}
                        {m.opposingParties.length > 0 && (
                          <span>vs. {m.opposingParties.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => setEditing({
                          matterId: m.id,
                          clientName: m.clientName,
                          matterName: m.matterName ?? '',
                          matterNumber: m.matterNumber ?? '',
                          opposingParties: m.opposingParties.join(', '),
                        })}
                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDeactivate(m.id)}
                        className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded"
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
