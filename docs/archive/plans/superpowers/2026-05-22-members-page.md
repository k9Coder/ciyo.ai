# Members Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Members page in the admin UI that lets admins list, invite, change roles of, and remove members from their organisation.

**Architecture:** The backend CRUD API for members is already complete (`GET/POST/PATCH/DELETE /v1/members` in `backend/src/members/router.ts`). The `api.members.*` methods exist in `admin/src/api.ts`. This plan only touches the frontend: extend `useMembers.ts` with a list query and standalone mutations, build `MembersPage.tsx`, and wire the `/members` route in `App.tsx`. The sidebar nav already has the `/members` link; no layout changes needed.

**Tech Stack:** React 18, @tanstack/react-query v5, TypeScript, React Router v6, Vite (admin app at `admin/`)

---

### Task 1: Extend useMembers hook

**Files:**
- Modify: `admin/src/hooks/useMembers.ts`

The current file only exports `useMemberMutations(teamId)` which is scoped to the Org/Teams page. We need to:
1. Add `useMembers()` — query all members for the tenant
2. Add `useMemberActions()` — standalone create/update/remove for the Members page
3. Rename existing export to `useTeamMemberMutations` so the name is unambiguous

- [ ] **Step 1: Replace `admin/src/hooks/useMembers.ts` with the following**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'
import type { Member } from '../types'

// Members page — list all members in the tenant.
export function useMembers() {
  return useQuery({ queryKey: ['members'], queryFn: api.members.list })
}

// Members page — create, update role, remove.
export function useMemberActions() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['members'] })

  const create = useMutation({
    mutationFn: (data: { email: string; displayName?: string; role?: Member['role'] }) =>
      api.members.create(data),
    onSuccess: () => { inv(); toast('Member added') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ displayName: string; role: Member['role'] }> }) =>
      api.members.update(id, data),
    onSuccess: () => { inv(); toast('Member updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.members.remove(id),
    onSuccess: () => { inv(); toast('Member removed') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return { create, update, remove }
}

// OrgPage (Teams section) — scoped to a specific team.
export function useTeamMemberMutations(teamId: string | null) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['team-members', teamId] })

  const create = useMutation({
    mutationFn: async (data: { email: string; displayName?: string }) => {
      const member = await api.members.create(data)
      if (teamId) await api.members.assignTeam(member.id, teamId)
      return member
    },
    onSuccess: () => { inv(); toast('Member added') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: (memberId: string) => teamId
      ? api.members.removeTeam(memberId, teamId)
      : api.members.remove(memberId),
    onSuccess: () => { inv(); toast('Member removed') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return { create, remove }
}
```

- [ ] **Step 2: Fix the old import name in OrgPage**

Run:
```bash
grep -n "useMemberMutations" admin/src/pages/OrgPage.tsx
```

If it imports `useMemberMutations`, change that import to `useTeamMemberMutations`. The call sites stay identical — the hook signature is unchanged.

- [ ] **Step 3: Commit**

```bash
git add admin/src/hooks/useMembers.ts admin/src/pages/OrgPage.tsx
git commit -m "feat(admin): add useMembers list query and standalone mutation hooks"
```

---

### Task 2: Build MembersPage

**Files:**
- Create: `admin/src/pages/MembersPage.tsx`

Style conventions from the existing codebase: all styles via inline `style={{}}` (no Tailwind, no CSS modules), CSS variables like `var(--bg-surface)`, `var(--border)`, `var(--text-primary)`, `var(--brand-primary)`, `var(--status-danger)`, `var(--text-muted)`. `ConfirmModal` takes `open`, `message`, `onClose`, `onConfirm`, `confirming` props. `PageHeader` takes `title` and optional `action` (ReactNode).

- [ ] **Step 1: Create `admin/src/pages/MembersPage.tsx`**

```tsx
import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
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
        {isLoading && (
          <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Loading…</p>
        )}
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
```

- [ ] **Step 2: Commit**

```bash
git add admin/src/pages/MembersPage.tsx
git commit -m "feat(admin): add MembersPage with invite, edit role, and remove"
```

---

### Task 3: Wire the route

**Files:**
- Modify: `admin/src/App.tsx`

- [ ] **Step 1: Add import and route to `admin/src/App.tsx`**

Add import at the top (with the other page imports):
```tsx
import { MembersPage } from './pages/MembersPage'
```

Add route inside the authenticated `<Route element={<RequireAuth>...}>` block, after `/settings`:
```tsx
<Route path="/members" element={<MembersPage />} />
```

- [ ] **Step 2: Start admin dev server and verify**

```bash
cd admin && npm run dev
```

Navigate to `http://localhost:5173/members`. Verify:
1. Sidebar "Members" link is active when on `/members`
2. Table renders (or "No members yet" if empty)
3. "+ Add Member" button toggles the invite form
4. Invite a member → appears in table immediately
5. "Edit role" → select a different role → Save → badge updates
6. "Remove" → confirm modal appears → member disappears on confirm

- [ ] **Step 3: Commit**

```bash
git add admin/src/App.tsx
git commit -m "feat(admin): wire /members route to MembersPage"
```
