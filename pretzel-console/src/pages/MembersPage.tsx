import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { InlineLoader } from '../components/ui/Spinner'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useMembers, useMemberActions } from '../hooks/useMembers'
// Token-invite-link flow retired — MembersPage now adds members directly
// (POST /v1/members) instead of generating a shareable /invite/{token} link.
import { useDivisions } from '../hooks/useDivisions'
import type { Member } from '../types'
import { formatDate } from '../utils/date'

const ROLE_LABEL: Record<Member['role'], string> = {
  super_admin:    'Super Admin',
  division_admin: 'Division Admin',
  member:         'Member',
}

const ROLE_COLOR: Record<Member['role'], string> = {
  super_admin:    'var(--status-danger)',
  division_admin: 'var(--status-warn)',
  member:         'var(--text-muted)',
}

const FAIL_MODE_INFO =
  'What happens when a check can\'t complete (app error, timeout, unreachable). ' +
  'Fail open = let it through. Fail closed = block it. ' +
  'Leave on "Org default" to inherit the organisation-wide setting.'

const infoIconStyle: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 5,
  width: 14,
  height: 14,
  lineHeight: '14px',
  borderRadius: '50%',
  border: '1px solid var(--text-muted)',
  color: 'var(--text-muted)',
  fontSize: 10,
  textAlign: 'center',
  cursor: 'default',
}

function InfoIcon({ title }: { title: string }) {
  return <span style={infoIconStyle} title={title}>i</span>
}

export function MembersPage() {
  const { data: members = [], isLoading } = useMembers()
  const { data: divisions = [] } = useDivisions()
  const { create, update, remove } = useMemberActions()

  const [showAdd, setShowAdd]                 = useState(false)
  const [addEmail, setAddEmail]               = useState('')
  const [addRole, setAddRole]                 = useState<Member['role']>('member')
  const [addDivisionId, setAddDivisionId]     = useState('')

  const [editingId, setEditingId]             = useState<string | null>(null)
  const [editRole, setEditRole]               = useState<Member['role']>('member')
  const [editDivisionId, setEditDivisionId]   = useState('')
  const [confirmRemove, setConfirmRemove]     = useState<Member | null>(null)

  const addNeedsDivision  = addRole === 'division_admin' && !addDivisionId
  const editNeedsDivision = editRole === 'division_admin' && !editDivisionId

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (addNeedsDivision || !addEmail.trim()) return
    create.mutate(
      {
        email:           addEmail.trim(),
        role:            addRole,
        adminDivisionId: addRole === 'division_admin' ? addDivisionId : undefined,
      },
      { onSuccess: resetAdd }
    )
  }

  function resetAdd() {
    setShowAdd(false)
    setAddEmail('')
    setAddRole('member')
    setAddDivisionId('')
  }

  function startEdit(m: Member) {
    setEditingId(m.id)
    setEditRole(m.role)
    setEditDivisionId(m.adminDivisionId ?? '')
  }
  function saveEdit(id: string) {
    if (editNeedsDivision) return
    update.mutate(
      { id, data: { role: editRole, adminDivisionId: editRole === 'division_admin' ? editDivisionId : null } },
      { onSuccess: () => setEditingId(null) }
    )
  }

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px',
    fontSize: 13, background: 'var(--bg-base)', color: 'var(--text-primary)', width: '100%',
  }

  return (
    <div style={{ padding: '16px 24px' }}>
      <PageHeader
        title="Members"
        action={
          <button
            onClick={() => setShowAdd(s => !s)}
            style={{
              background: 'var(--brand-primary)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Add Member
          </button>
        }
      />

      {showAdd && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 16, marginBottom: 16,
        }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Email</span>
              <input
                type="email" required value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                placeholder="alice@lawfirm.com"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 150px' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Role</span>
              <select
                value={addRole}
                onChange={e => setAddRole(e.target.value as Member['role'])}
                style={inputStyle}
              >
                <option value="member">Member</option>
                <option value="division_admin">Division Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </label>
            {addRole === 'division_admin' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 180px' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Division</span>
                <select
                  value={addDivisionId}
                  onChange={e => setAddDivisionId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Select a division…</option>
                  {divisions.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="submit" disabled={create.isPending || addNeedsDivision || !addEmail.trim()}
              style={{
                background: 'var(--brand-primary)', color: '#fff', border: 'none',
                borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {create.isPending ? 'Adding…' : 'Add member'}
            </button>
            <button
              type="button" onClick={resetAdd}
              style={{
                background: 'transparent', color: 'var(--text-muted)',
                border: '1px solid var(--border)', borderRadius: 6,
                padding: '7px 16px', fontSize: 13, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {isLoading && <InlineLoader />}
        {!isLoading && members.length === 0 && (
          <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            No members yet. Click <strong>+ Add Member</strong> to get started.
          </p>
        )}
        {members.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Email', 'Display Name', 'Role', 'Fail Mode', 'Joined', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left',
                    color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {h}
                    {h === 'Fail Mode' && <InfoIcon title={FAIL_MODE_INFO} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>{m.email}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{m.displayName ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {editingId === m.id ? (
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select
                          aria-label="Role"
                          value={editRole}
                          onChange={e => setEditRole(e.target.value as Member['role'])}
                          style={{
                            border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px',
                            fontSize: 12, background: 'var(--bg-base)', color: 'var(--text-primary)',
                          }}
                        >
                          <option value="member">Member</option>
                          <option value="division_admin">Division Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                        {editRole === 'division_admin' && (
                          <select
                            aria-label="Division"
                            value={editDivisionId}
                            onChange={e => setEditDivisionId(e.target.value)}
                            style={{
                              border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px',
                              fontSize: 12, background: 'var(--bg-base)', color: 'var(--text-primary)',
                            }}
                          >
                            <option value="">Select a division…</option>
                            {divisions.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        )}
                        <button
                          onClick={() => saveEdit(m.id)} disabled={update.isPending || editNeedsDivision}
                          style={{
                            background: 'var(--brand-primary)', color: '#fff', border: 'none',
                            borderRadius: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{ background: 'transparent', border: 'none', fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)' }}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                        background: 'var(--bg-surface-raised)', color: ROLE_COLOR[m.role],
                      }}>
                        {ROLE_LABEL[m.role]}
                        {m.role === 'division_admin' && (
                          <span style={{ fontWeight: 400, opacity: 0.8 }}>
                            {' — '}
                            {divisions.find(d => d.id === m.adminDivisionId)?.name ?? 'no division set'}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <select
                      aria-label="Fail mode"
                      value={m.failMode ?? ''}
                      disabled={update.isPending}
                      onChange={e => {
                        const value = e.target.value
                        update.mutate({ id: m.id, data: { failMode: value === '' ? null : (value as 'open' | 'closed') } })
                      }}
                      style={{
                        border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px',
                        fontSize: 12, background: 'var(--bg-base)', color: 'var(--text-primary)',
                      }}
                    >
                      <option value="">Org default</option>
                      <option value="open">Fail open</option>
                      <option value="closed">Fail closed</option>
                    </select>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
                    {formatDate(m.createdAt)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      {editingId !== m.id && (
                        <button
                          onClick={() => startEdit(m)}
                          style={{
                            background: 'none', border: '1px solid var(--border)',
                            borderRadius: 6, padding: '4px 10px', fontSize: 12,
                            cursor: 'pointer', color: 'var(--text-secondary)',
                          }}
                        >
                          Edit role
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmRemove(m)}
                        style={{
                          background: 'none', border: '1px solid var(--status-danger)',
                          borderRadius: 6, padding: '4px 10px', fontSize: 12,
                          cursor: 'pointer', color: 'var(--status-danger)',
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        open={!!confirmRemove}
        message={`Remove ${confirmRemove?.email ?? ''} from the organisation? This cannot be undone.`}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (!confirmRemove) return
          remove.mutate(confirmRemove.id, { onSuccess: () => setConfirmRemove(null) })
        }}
        confirming={remove.isPending}
      />
    </div>
  )
}
