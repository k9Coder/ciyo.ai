import { useState } from 'react'
import { SplitPane } from '../components/ui/SplitPane'
import { InlineLoader } from '../components/ui/Spinner'
import { PageHeader } from '../components/ui/PageHeader'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { EntityModal } from '../components/ui/EntityModal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useSubjects, useSubjectMutations } from '../hooks/useSubjects'
import { useRules, useRuleMutations } from '../hooks/useRules'
import type { Subject, Rule } from '../types'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg-surface-raised)',
  color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
}
const monoInputStyle: React.CSSProperties = { ...inputStyle, fontFamily: 'monospace' }
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4,
}
const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer',
}

function SubjectForm({
  value, onChange,
}: {
  value: { name: string; description: string }
  onChange: (v: { name: string; description: string }) => void
}) {
  return (
    <>
      <div>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={value.name}
          onChange={e => onChange({ ...value, name: e.target.value })}
          placeholder="e.g. Litigation Docs" autoFocus />
      </div>
      <div>
        <label style={labelStyle}>Description (optional)</label>
        <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2}
          value={value.description}
          onChange={e => onChange({ ...value, description: e.target.value })} />
      </div>
    </>
  )
}

type RuleFormState = {
  kind:               Rule['kind']
  action:             Rule['action']
  keywords:           string
  pattern:            string
  message:            string
  destinationGroupIds: string
  reportLevel:        Rule['reportLevel']
}

function RuleForm({ value, onChange }: { value: RuleFormState; onChange: (v: RuleFormState) => void }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Kind</label>
          <select style={selectStyle} value={value.kind}
            onChange={e => onChange({ ...value, kind: e.target.value as Rule['kind'] })}>
            <option value="keyword">keyword</option>
            <option value="pattern">pattern</option>
            <option value="entropy">entropy</option>
            <option value="score">score</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Action</label>
          <select style={selectStyle} value={value.action}
            onChange={e => onChange({ ...value, action: e.target.value as Rule['action'] })}>
            <option value="warn">warn</option>
            <option value="block">block</option>
          </select>
        </div>
      </div>

      {value.kind === 'keyword' && (
        <div>
          <label style={labelStyle}>Keywords (comma-separated)</label>
          <textarea style={{ ...monoInputStyle, resize: 'vertical' }} rows={3}
            value={value.keywords}
            onChange={e => onChange({ ...value, keywords: e.target.value })}
            placeholder="attorney-client, privileged, confidential" />
        </div>
      )}

      {value.kind === 'pattern' && (
        <div>
          <label style={labelStyle}>Regex pattern</label>
          <input style={monoInputStyle} value={value.pattern}
            onChange={e => onChange({ ...value, pattern: e.target.value })}
            placeholder="sk-[A-Za-z0-9]{20,}" />
        </div>
      )}

      {(value.kind === 'entropy' || value.kind === 'score') && (
        <div>
          <label style={labelStyle}>Config JSON (advanced — stored as JSONB)</label>
          <textarea style={{ ...monoInputStyle, resize: 'vertical' }} rows={4}
            value={value.keywords}
            onChange={e => onChange({ ...value, keywords: e.target.value })}
            placeholder='{"threshold": 4.5}' />
        </div>
      )}

      <div>
        <label style={labelStyle}>Message (optional)</label>
        <input style={inputStyle} value={value.message}
          onChange={e => onChange({ ...value, message: e.target.value })}
          placeholder="Sensitive content detected" />
      </div>

      <div>
        <label style={labelStyle}>Report to analytics</label>
        <select style={selectStyle} value={value.reportLevel}
          onChange={e => onChange({ ...value, reportLevel: e.target.value as Rule['reportLevel'] })}>
          <option value="none">None — don&apos;t report</option>
          <option value="minimal">Minimal — action + site + time</option>
          <option value="medium">Medium — + who triggered it</option>
          <option value="rich">Rich — + matched term/pattern</option>
        </select>
      </div>

      <div>
        <label style={labelStyle}>Destination Group IDs (comma-separated UUIDs, optional)</label>
        <input style={monoInputStyle} value={value.destinationGroupIds}
          onChange={e => onChange({ ...value, destinationGroupIds: e.target.value })}
          placeholder="uuid1, uuid2" />
      </div>
    </>
  )
}

function RulesPanel({ subject }: { subject: Subject }) {
  const { data: rules = [], isLoading } = useRules(subject.id)
  const mutations = useRuleMutations(subject.id)

  const blankRule: RuleFormState = { kind: 'keyword', action: 'warn', keywords: '', pattern: '', message: '', destinationGroupIds: '', reportLevel: 'none' }
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
        kind:               rule.kind,
        action:             rule.action,
        keywords:           rule.keywords?.join(', ') ?? '',
        pattern:            rule.pattern ?? '',
        message:            rule.message ?? '',
        destinationGroupIds: rule.destinationGroupIds.join(', '),
        reportLevel:        rule.reportLevel,
      },
    })
  }
  function closeModal() { setModal(m => ({ ...m, open: false })) }

  function buildPayload(form: RuleFormState) {
    return {
      kind:               form.kind,
      action:             form.action,
      keywords:           form.kind === 'keyword' ? form.keywords.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      pattern:            form.kind === 'pattern' ? form.pattern.trim() || undefined : undefined,
      message:            form.message.trim() || undefined,
      destinationGroupIds: form.destinationGroupIds.split(',').map(s => s.trim()).filter(Boolean),
      reportLevel:        form.reportLevel,
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

  if (isLoading) return <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)' }}>Loading rules…</div>

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Rules — {subject.name}
        </h2>
        <button onClick={openNew} style={{ fontSize: 13, fontWeight: 500, color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
          + Add rule
        </button>
      </div>

      {rules.length === 0 ? (
        <EmptyState title="No rules yet" action={{ label: '+ Add rule', onClick: openNew }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map(rule => (
            <div
              key={rule.id}
              className="group"
              style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                       padding: 12, background: 'var(--bg-surface-raised)', border: '1px solid var(--border)', borderRadius: 8 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Badge variant={rule.kind}>{rule.kind}</Badge>
                <Badge variant={rule.action}>{rule.action}</Badge>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {rule.kind === 'keyword' ? rule.keywords?.join(', ') : rule.pattern ?? '—'}
                </span>
              </div>
              <div className="hidden group-hover:flex" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8, flexShrink: 0 }}>
                <button onClick={() => openEdit(rule)} style={{ fontSize: 12, color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
                <button onClick={() => setDeleting(rule)} style={{ fontSize: 12, color: 'var(--status-danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Subjects</span>
        <button onClick={openNew} style={{ fontSize: 12, fontWeight: 500, color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>+ New</button>
      </div>
      {isLoading ? (
        <InlineLoader />
      ) : subjects.length === 0 ? (
        <EmptyState title="No subjects" action={{ label: '+ New subject', onClick: openNew }} />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {subjects.map(s => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 16px',
                borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: selected?.id === s.id ? 'var(--bg-surface-raised)' : 'transparent',
                borderLeft: selected?.id === s.id ? '2px solid var(--brand-primary)' : '2px solid transparent',
                border: 'none', display: 'block',
              }}
              className="group"
            >
              <div style={{ fontSize: 13, fontWeight: selected?.id === s.id ? 600 : 400,
                            color: selected?.id === s.id ? 'var(--brand-primary)' : 'var(--text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </div>
              {s.description && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.description}
                </div>
              )}
              <div className="hidden group-hover:flex" style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <span onClick={e => { e.stopPropagation(); openEdit(s) }} style={{ fontSize: 11, color: 'var(--brand-primary)', cursor: 'pointer' }}>Edit</span>
                <span onClick={e => { e.stopPropagation(); setDeleting(s) }} style={{ fontSize: 11, color: 'var(--status-danger)', cursor: 'pointer' }}>Delete</span>
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
    <div style={{ padding: '16px 24px' }}>
      <PageHeader title="Subjects & Rules" action={
        <button onClick={openNew} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, color: 'var(--bg-base)',
                                           background: 'var(--brand-primary)', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          + New subject
        </button>
      } />
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
                    overflow: 'hidden', height: 'calc(100vh - 232px)' }}>
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
    </div>
  )
}
