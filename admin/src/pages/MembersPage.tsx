import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { InlineLoader } from '../components/ui/Spinner'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useMembers, useMemberActions } from '../hooks/useMembers'
import type { Member } from '../types'

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

export function MembersPage() {
  const { data: members = [], isLoading } = useMembers()
  const { create, update, remove } = useMemberActions()

  const [showInvite, setShowInvite]       = useState(false)
  const [inviteEmail, setInviteEmail]     = useState('')
  const [inviteName, setInviteName]       = useState('')
  const [inviteRole, setInviteRole]       = useState<Member['role']>('member')

  const [editingId, setEditingId]         = useState<string | null>(null)
  const [editRole, setEditRole]           = useState<Member['role']>('member')

  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null)

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    create.mutate(
      { email: inviteEmail.trim(), displayName: inviteName.trim() || undefined, role: inviteRole },
      { onSuccess: () => { setInviteEmail(''); setInviteName(''); setInviteRole('member'); setShowInvite(false) } },
    )
  }

  function startEdit(m: Member) { setEditingId(m.id); setEditRole(m.role) }
  function saveEdit(id: string) {
    update.mutate({ id, data: { role: editRole } }, { onSuccess: () => setEditingId(null) })
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
            onClick={() => setShowInvite(s => !s)}
            style={{
              background: 'var(--brand-primary)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Add Member
          </button>
        }
      />

      {showInvite && (
        <form
          onSubmit={handleInvite}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 16, marginBottom: 16,
            display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 180px' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Email *</span>
            <input
              type="email" required value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="alice@example.com"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 160px' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Display name</span>
            <input
              value={inviteName} onChange={e => setInviteName(e.target.value)}
              placeholder="Alice Smith"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 150px' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Role</span>
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as Member['role'])}
              style={inputStyle}
            >
              <option value="member">Member</option>
              <option value="division_admin">Division Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </label>
          <button
            type="submit" disabled={create.isPending}
            style={{
              background: 'var(--brand-primary)', color: '#fff', border: 'none',
              borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {create.isPending ? 'Adding…' : 'Add'}
          </button>
          <button
            type="button" onClick={() => setShowInvite(false)}
            style={{
              background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '7px 16px', fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </form>
      )}

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {isLoading && <InlineLoader />}
        {!isLoading && members.length === 0 && (
          <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            No members yet. Click <strong>+ Add Member</strong> to invite your first member.
          </p>
        )}
        {members.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Email', 'Display Name', 'Role', 'Joined', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left',
                    color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {h}
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
                        <button
                          onClick={() => saveEdit(m.id)} disabled={update.isPending}
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
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
                    {new Date(m.createdAt).toLocaleDateString()}
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
