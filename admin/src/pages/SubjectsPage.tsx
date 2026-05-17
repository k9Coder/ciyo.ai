import { useState } from 'react'
import { SplitPane } from '../components/ui/SplitPane'
import { PageHeader } from '../components/ui/PageHeader'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { EntityModal } from '../components/ui/EntityModal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useSubjects, useSubjectMutations } from '../hooks/useSubjects'
import { useRules, useRuleMutations } from '../hooks/useRules'
import type { Subject, Rule } from '../types'

function SubjectForm({
  value, onChange,
}: {
  value: { name: string; description: string }
  onChange: (v: { name: string; description: string }) => void
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={value.name}
          onChange={e => onChange({ ...value, name: e.target.value })}
          placeholder="e.g. Litigation Docs"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
        <textarea
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
          value={value.description}
          onChange={e => onChange({ ...value, description: e.target.value })}
        />
      </div>
    </>
  )
}

type RuleFormState = {
  kind: Rule['kind']
  action: Rule['action']
  keywords: string
  pattern: string
  message: string
  destinationGroupIds: string
}

function RuleForm({ value, onChange }: { value: RuleFormState; onChange: (v: RuleFormState) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Kind</label>
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            value={value.kind}
            onChange={e => onChange({ ...value, kind: e.target.value as Rule['kind'] })}
          >
            <option value="keyword">keyword</option>
            <option value="pattern">pattern</option>
            <option value="entropy">entropy</option>
            <option value="score">score</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Action</label>
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            value={value.action}
            onChange={e => onChange({ ...value, action: e.target.value as Rule['action'] })}
          >
            <option value="warn">warn</option>
            <option value="block">block</option>
          </select>
        </div>
      </div>

      {value.kind === 'keyword' && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Keywords (comma-separated)</label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            rows={3}
            value={value.keywords}
            onChange={e => onChange({ ...value, keywords: e.target.value })}
            placeholder="attorney-client, privileged, confidential"
          />
        </div>
      )}

      {value.kind === 'pattern' && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Regex pattern</label>
          <input
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            value={value.pattern}
            onChange={e => onChange({ ...value, pattern: e.target.value })}
            placeholder="sk-[A-Za-z0-9]{20,}"
          />
        </div>
      )}

      {(value.kind === 'entropy' || value.kind === 'score') && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Config JSON (advanced — stored as JSONB)
          </label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            rows={4}
            value={value.keywords}
            onChange={e => onChange({ ...value, keywords: e.target.value })}
            placeholder='{"threshold": 4.5}'
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Message (optional)</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          value={value.message}
          onChange={e => onChange({ ...value, message: e.target.value })}
          placeholder="Sensitive content detected"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Destination Group IDs (comma-separated UUIDs, optional)
        </label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          value={value.destinationGroupIds}
          onChange={e => onChange({ ...value, destinationGroupIds: e.target.value })}
          placeholder="uuid1, uuid2"
        />
      </div>
    </>
  )
}

function RulesPanel({ subject }: { subject: Subject }) {
  const { data: rules = [], isLoading } = useRules(subject.id)
  const mutations = useRuleMutations(subject.id)

  const blankRule: RuleFormState = { kind: 'keyword', action: 'warn', keywords: '', pattern: '', message: '', destinationGroupIds: '' }
  const [modal, setModal] = useState<{ open: boolean; editing: Rule | null; form: RuleFormState }>({
    open: false, editing: null, form: blankRule,
  })
  const [deleting, setDeleting] = useState<Rule | null>(null)

  function openNew() { setModal({ open: true, editing: null, form: blankRule }) }
  function openEdit(rule: Rule) {
    setModal({
      open: true,
      editing: rule,
      form: {
        kind: rule.kind,
        action: rule.action,
        keywords: rule.keywords?.join(', ') ?? '',
        pattern: rule.pattern ?? '',
        message: rule.message ?? '',
        destinationGroupIds: rule.destinationGroupIds.join(', '),
      },
    })
  }
  function closeModal() { setModal(m => ({ ...m, open: false })) }

  function buildPayload(form: RuleFormState) {
    return {
      kind: form.kind,
      action: form.action,
      keywords: form.kind === 'keyword' ? form.keywords.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      pattern: form.kind === 'pattern' ? form.pattern.trim() || undefined : undefined,
      message: form.message.trim() || undefined,
      destinationGroupIds: form.destinationGroupIds.split(',').map(s => s.trim()).filter(Boolean),
    }
  }

  async function handleSave() {
    const payload = buildPayload(modal.form)
    if (modal.editing) {
      await mutations.update.mutateAsync({ id: modal.editing.id, data: payload })
    } else {
      await mutations.create.mutateAsync(payload)
    }
    closeModal()
  }

  if (isLoading) return <div className="p-6 text-sm text-gray-400">Loading rules…</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Rules — {subject.name}</h2>
        <button onClick={openNew} className="text-sm font-medium text-blue-600 hover:text-blue-800">
          + Add rule
        </button>
      </div>

      {rules.length === 0 ? (
        <EmptyState title="No rules yet" action={{ label: '+ Add rule', onClick: openNew }} />
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div
              key={rule.id}
              className="flex items-start justify-between p-3 bg-white border border-gray-200 rounded-lg group"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={rule.kind}>{rule.kind}</Badge>
                <Badge variant={rule.action}>{rule.action}</Badge>
                <span className="text-sm text-gray-700 font-mono">
                  {rule.kind === 'keyword' ? rule.keywords?.join(', ') : rule.pattern ?? '—'}
                </span>
              </div>
              <div className="hidden group-hover:flex items-center gap-2 ml-2 shrink-0">
                <button onClick={() => openEdit(rule)} className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
                <button onClick={() => setDeleting(rule)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <EntityModal
        open={modal.open}
        title={modal.editing ? 'Edit rule' : 'New rule'}
        onClose={closeModal}
        onSave={handleSave}
        saving={mutations.create.isPending || mutations.update.isPending}
      >
        <RuleForm value={modal.form} onChange={form => setModal(m => ({ ...m, form }))} />
      </EntityModal>

      <ConfirmModal
        open={!!deleting}
        message={`Delete this ${deleting?.kind} rule? This cannot be undone.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await mutations.remove.mutateAsync(deleting!.id)
          setDeleting(null)
        }}
        confirming={mutations.remove.isPending}
      />
    </div>
  )
}

export function SubjectsPage() {
  const { data: subjects = [], isLoading } = useSubjects()
  const mutations = useSubjectMutations()

  const blank = { name: '', description: '' }
  const [selected, setSelected] = useState<Subject | null>(null)
  const [modal, setModal] = useState<{ open: boolean; editing: Subject | null; form: typeof blank }>({
    open: false, editing: null, form: blank,
  })
  const [deleting, setDeleting] = useState<Subject | null>(null)

  function openNew() { setModal({ open: true, editing: null, form: blank }) }
  function openEdit(s: Subject) { setModal({ open: true, editing: s, form: { name: s.name, description: s.description ?? '' } }) }
  function closeModal() { setModal(m => ({ ...m, open: false })) }

  async function handleSave() {
    if (modal.editing) {
      await mutations.update.mutateAsync({ id: modal.editing.id, data: modal.form })
    } else {
      await mutations.create.mutateAsync(modal.form)
    }
    closeModal()
  }

  const left = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700">Subjects</span>
        <button onClick={openNew} className="text-xs font-medium text-blue-600 hover:text-blue-800">+ New</button>
      </div>
      {isLoading ? (
        <div className="p-4 text-sm text-gray-400">Loading…</div>
      ) : subjects.length === 0 ? (
        <EmptyState title="No subjects" action={{ label: '+ New subject', onClick: openNew }} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {subjects.map(s => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 group ${
                selected?.id === s.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className={`text-sm font-medium truncate ${selected?.id === s.id ? 'text-blue-700' : 'text-gray-800'}`}>
                {s.name}
              </div>
              {s.description && <div className="text-xs text-gray-400 truncate">{s.description}</div>}
              <div className="hidden group-hover:flex gap-2 mt-1">
                <span onClick={e => { e.stopPropagation(); openEdit(s) }} className="text-xs text-blue-600 hover:text-blue-800">Edit</span>
                <span onClick={e => { e.stopPropagation(); setDeleting(s) }} className="text-xs text-red-500 hover:text-red-700">Delete</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  const right = selected
    ? <RulesPanel subject={selected} />
    : <EmptyState title="Select a subject" description="Choose a subject on the left to view and manage its rules." />

  return (
    <>
      <PageHeader title="Subjects & Rules" action={
        <button onClick={openNew} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
          + New subject
        </button>
      } />
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
        <SplitPane left={left} right={right} />
      </div>

      <EntityModal
        open={modal.open}
        title={modal.editing ? 'Edit subject' : 'New subject'}
        onClose={closeModal}
        onSave={handleSave}
        saving={mutations.create.isPending || mutations.update.isPending}
      >
        <SubjectForm value={modal.form} onChange={form => setModal(m => ({ ...m, form }))} />
      </EntityModal>

      <ConfirmModal
        open={!!deleting}
        message={`Delete subject "${deleting?.name}" and all its rules? This cannot be undone.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await mutations.remove.mutateAsync(deleting!.id)
          if (selected?.id === deleting?.id) setSelected(null)
          setDeleting(null)
        }}
        confirming={mutations.remove.isPending}
      />
    </>
  )
}
