import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { MillerColumns } from '../components/ui/MillerColumns'
import { EntityModal } from '../components/ui/EntityModal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useDivisions, useDivisionMutations } from '../hooks/useDivisions'
import { useTeams, useTeamMembers, useTeamMutations } from '../hooks/useTeams'
import { useTeamMemberMutations } from '../hooks/useMembers'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg-surface-raised)',
  color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4,
}

function NameForm({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input style={inputStyle} value={value} onChange={e => onChange(e.target.value)} autoFocus />
    </div>
  )
}

function MemberForm({
  value, onChange,
}: {
  value: { email: string; displayName: string }
  onChange: (v: { email: string; displayName: string }) => void
}) {
  return (
    <>
      <div>
        <label style={labelStyle}>Email</label>
        <input type="email" style={inputStyle} value={value.email}
          onChange={e => onChange({ ...value, email: e.target.value })} autoFocus />
      </div>
      <div>
        <label style={labelStyle}>Display name (optional)</label>
        <input style={inputStyle} value={value.displayName}
          onChange={e => onChange({ ...value, displayName: e.target.value })} />
      </div>
    </>
  )
}

type ModalState =
  | { type: 'none' }
  | { type: 'division'; id: string | null; name: string }
  | { type: 'team'; id: string | null; name: string }
  | { type: 'member'; id: string | null; email: string; displayName: string }

type ConfirmState =
  | { type: 'none' }
  | { type: 'division'; id: string; name: string }
  | { type: 'team'; id: string; name: string }
  | { type: 'member'; id: string; label: string }

export function OrgPage() {
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [confirm, setConfirm] = useState<ConfirmState>({ type: 'none' })

  const { data: divisions = [], isLoading: loadingDivs } = useDivisions()
  const { data: teams = [], isLoading: loadingTeams } = useTeams(selectedDivisionId)
  const { data: members = [], isLoading: loadingMembers } = useTeamMembers(selectedTeamId)

  const divMutations = useDivisionMutations()
  const teamMutations = useTeamMutations(selectedDivisionId)
  const memberMutations = useTeamMemberMutations(selectedTeamId)

  function closeModal() { setModal({ type: 'none' }) }
  function closeConfirm() { setConfirm({ type: 'none' }) }

  async function handleSave() {
    if (modal.type === 'division') {
      if (modal.id) await divMutations.update.mutateAsync({ id: modal.id, name: modal.name })
      else await divMutations.create.mutateAsync(modal.name)
    } else if (modal.type === 'team') {
      if (modal.id) await teamMutations.update.mutateAsync({ id: modal.id, name: modal.name })
      else await teamMutations.create.mutateAsync(modal.name)
    } else if (modal.type === 'member') {
      if (!modal.id) {
        await memberMutations.create.mutateAsync({ email: modal.email, displayName: modal.displayName || undefined })
      }
    }
    closeModal()
  }

  async function handleConfirmDelete() {
    if (confirm.type === 'division') await divMutations.remove.mutateAsync(confirm.id)
    else if (confirm.type === 'team') await teamMutations.remove.mutateAsync(confirm.id)
    else if (confirm.type === 'member') await memberMutations.remove.mutateAsync(confirm.id)
    closeConfirm()
  }

  const isSaving =
    divMutations.create.isPending || divMutations.update.isPending ||
    teamMutations.create.isPending || teamMutations.update.isPending ||
    memberMutations.create.isPending

  const isDeleting =
    divMutations.remove.isPending || teamMutations.remove.isPending || memberMutations.remove.isPending

  const columns = [
    {
      title: 'Divisions',
      items: divisions.map(d => ({ id: d.id, label: d.name })),
      selectedId: selectedDivisionId,
      onSelect: (id: string) => { setSelectedDivisionId(id); setSelectedTeamId(null) },
      onAdd: () => setModal({ type: 'division', id: null, name: '' }),
      onEdit: (id: string) => {
        const d = divisions.find(x => x.id === id)
        if (d) setModal({ type: 'division', id, name: d.name })
      },
      onDelete: (id: string) => {
        const d = divisions.find(x => x.id === id)
        if (d) setConfirm({ type: 'division', id, name: d.name })
      },
      loading: loadingDivs,
    },
    {
      title: 'Teams',
      items: teams.map(t => ({ id: t.id, label: t.name })),
      selectedId: selectedTeamId,
      onSelect: setSelectedTeamId,
      onAdd: selectedDivisionId ? () => setModal({ type: 'team', id: null, name: '' }) : undefined,
      onEdit: (id: string) => {
        const t = teams.find(x => x.id === id)
        if (t) setModal({ type: 'team', id, name: t.name })
      },
      onDelete: (id: string) => {
        const t = teams.find(x => x.id === id)
        if (t) setConfirm({ type: 'team', id, name: t.name })
      },
      loading: loadingTeams,
    },
    {
      title: 'Members',
      items: members.map(m => ({
        id: m.id,
        label: m.displayName ?? m.email,
        sublabel: m.email !== (m.displayName ?? '') ? m.email : undefined,
      })),
      selectedId: null,
      onSelect: () => {},
      onAdd: selectedTeamId ? () => setModal({ type: 'member', id: null, email: '', displayName: '' }) : undefined,
      onDelete: (id: string) => {
        const m = members.find(x => x.id === id)
        if (m) setConfirm({ type: 'member', id, label: m.displayName ?? m.email })
      },
      loading: loadingMembers,
    },
  ]

  const modalTitle =
    modal.type === 'division' ? (modal.id ? 'Edit division' : 'New division') :
    modal.type === 'team'     ? (modal.id ? 'Edit team'     : 'New team')     :
    modal.type === 'member'   ? 'Add member' : ''

  const confirmMessage =
    confirm.type === 'division' ? `Delete division "${confirm.name}"?` :
    confirm.type === 'team'     ? `Delete team "${confirm.name}"?` :
    confirm.type === 'member'   ? `Remove "${confirm.label}" from this team?` : ''

  return (
    <div style={{ padding: '16px 24px' }}>
      <PageHeader title="Org Structure" />
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', height: 'calc(100vh - 232px)',
      }}>
        <MillerColumns columns={columns} />
      </div>

      <EntityModal
        open={modal.type !== 'none'}
        title={modalTitle}
        onClose={closeModal}
        onSave={handleSave}
        saving={isSaving}
      >
        {modal.type === 'division' && (
          <NameForm label="Division name" value={modal.name} onChange={name => setModal(m => ({ ...m as typeof modal & { type: 'division' }, name }))} />
        )}
        {modal.type === 'team' && (
          <NameForm label="Team name" value={modal.name} onChange={name => setModal(m => ({ ...m as typeof modal & { type: 'team' }, name }))} />
        )}
        {modal.type === 'member' && (
          <MemberForm
            value={{ email: modal.email, displayName: modal.displayName }}
            onChange={v => setModal(m => ({ ...m as typeof modal & { type: 'member' }, ...v }))}
          />
        )}
      </EntityModal>

      <ConfirmModal
        open={confirm.type !== 'none'}
        message={confirmMessage}
        onClose={closeConfirm}
        onConfirm={handleConfirmDelete}
        confirming={isDeleting}
      />
    </div>
  )
}
