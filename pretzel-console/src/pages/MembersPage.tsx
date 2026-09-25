import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { PeopleTabs } from '../components/ui/PeopleTabs'
import { InlineLoader } from '../components/ui/Spinner'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useMembers, useMemberActions } from '../hooks/useMembers'
// Token-invite-link flow retired — MembersPage now adds members directly
// (POST /v1/members) instead of generating a shareable /invite/{token} link.
import { useDivisions } from '../hooks/useDivisions'
import type { Member } from '../types'
import { formatDate, formatDateTime } from '../utils/date'

const ROLE_LABEL: Record<Member['role'], string> = {
  super_admin:    'Super Admin',
  division_admin: 'Division Admin',
  member:         'Member',
}

const ROLE_COLOR: Record<Member['role'], string> = {
  super_admin:    'var(--brand)',
  division_admin: 'var(--warn)',
  member:         'var(--muted)',
}

const FAIL_MODE_INFO =
  'What happens when a check can\'t complete (app error, timeout, unreachable). ' +
  'Fail open = let it through. Fail closed = block it. ' +
  'Leave on "Org default" to inherit the organisation-wide setting.'

const DESKTOP_INFO =
  'Pretzel Desktop activity for this member: when they last signed in, and when they last signed out ' +
  'from the app. "Signed out" means protection is off on their device until they sign in again.'

const infoIconStyle: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 5,
  width: 14,
  height: 14,
  lineHeight: '14px',
  borderRadius: '50%',
  border: '1px solid var(--muted)',
  color: 'var(--muted)',
  fontSize: 12,
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
    border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '6px 10px',
    fontSize: 15, background: 'var(--bg)', color: 'var(--ink)', width: '100%',
  }

  return (
    <div style={{ padding: '32px 36px 40px' }}>
      <PageHeader
        title="People"
        action={
          <button
            onClick={() => setShowAdd(s => !s)}
            style={{
              background: 'var(--btn-bg)', color: 'var(--btn-fg)', border: 'none',
              borderRadius: 'var(--r-btn)', padding: '7px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Add Member
          </button>
        }
      />
      <PeopleTabs />

      {showAdd && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 'var(--r)', padding: 16, marginBottom: 16,
        }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Email</span>
              <input
                type="email" required value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                placeholder="alice@lawfirm.com"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 150px' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Role</span>
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
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Division</span>
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
                background: 'var(--btn-bg)', color: 'var(--btn-fg)', border: 'none',
                borderRadius: 'var(--r-btn)', padding: '7px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {create.isPending ? 'Adding…' : 'Add member'}
            </button>
            <button
              type="button" onClick={resetAdd}
              style={{
                background: 'transparent', color: 'var(--muted)',
                border: '1px solid var(--line)', borderRadius: 'var(--r-btn)',
                padding: '7px 16px', fontSize: 15, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
        {isLoading && <InlineLoader />}
        {!isLoading && members.length === 0 && (
          <p style={{ padding: 24, color: 'var(--muted)', fontSize: 15, margin: 0 }}>
            No members yet. Click <strong>+ Add Member</strong> to get started.
          </p>
        )}
        {members.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Email', 'Display Name', 'Role', 'Fail Mode', 'Desktop', 'Joined', ''].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px', textAlign: 'left',
                    color: 'var(--muted)', fontSize: 13, fontWeight: 400,
                  }}>
                    {h}
                    {h === 'Fail Mode' && <InfoIcon title={FAIL_MODE_INFO} />}
                    {h === 'Desktop' && <InfoIcon title={DESKTOP_INFO} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '12px 16px', color: 'var(--ink)' }}>{m.email}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>{m.displayName ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {editingId === m.id ? (
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select
                          aria-label="Role"
                          value={editRole}
                          onChange={e => setEditRole(e.target.value as Member['role'])}
                          style={{
                            border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '3px 8px',
                            fontSize: 14, background: 'var(--bg)', color: 'var(--ink)',
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
                              border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '3px 8px',
                              fontSize: 14, background: 'var(--bg)', color: 'var(--ink)',
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
                            background: 'var(--btn-bg)', color: 'var(--btn-fg)', border: 'none',
                            borderRadius: 'var(--r-btn)', padding: '3px 8px', fontSize: 14, cursor: 'pointer',
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{ background: 'transparent', border: 'none', fontSize: 14, cursor: 'pointer', color: 'var(--muted)' }}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 13, fontWeight: 500, padding: '3px 10px', borderRadius: 'var(--r-btn)',
                        background: 'var(--fill)', color: ROLE_COLOR[m.role],
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
                        border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '3px 8px',
                        fontSize: 14, background: 'var(--bg)', color: 'var(--ink)',
                      }}
                    >
                      <option value="">Org default</option>
                      <option value="open">Fail open</option>
                      <option value="closed">Fail closed</option>
                    </select>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 14 }}>
                    {m.desktopLastSignInAt ? (
                      <>
                        <div>
                          {m.desktopLastSignOutAt && new Date(m.desktopLastSignOutAt) >= new Date(m.desktopLastSignInAt)
                            ? 'Signed out'
                            : 'Signed in'}
                        </div>
                        <div>In: {formatDateTime(m.desktopLastSignInAt)}</div>
                        <div>Out: {m.desktopLastSignOutAt ? formatDateTime(m.desktopLastSignOutAt) : '—'}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 14 }}>
                    {formatDate(m.createdAt)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      {editingId !== m.id && (
                        <button
                          onClick={() => startEdit(m)}
                          style={{
                            background: 'var(--fill)', border: 'none', whiteSpace: 'nowrap',
                            borderRadius: 'var(--r-btn)', padding: '6px 12px', fontSize: 14,
                            cursor: 'pointer', color: 'var(--ink)',
                          }}
                        >
                          Edit role
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmRemove(m)}
                        style={{
                          background: 'var(--block-fill)', border: 'none', whiteSpace: 'nowrap',
                          borderRadius: 'var(--r-btn)', padding: '6px 12px', fontSize: 14,
                          cursor: 'pointer', color: 'var(--block)',
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
