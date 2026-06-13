# Invite Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a token-based invite link system so admins can share a URL that lets new users sign up and join their organisation automatically, plus fix two existing member-enrollment bugs and bring seed scripts and README up to date.

**Architecture:** A new `invites` table stores short-lived tokens (72 h expiry, one-time-use). The admin generates a link via `POST /v1/invites`; the recipient opens `/invite/:token` in the admin app, signs in or signs up via Clerk, then hits `POST /v1/invites/:token/accept` which enrolls them as a `members` row. Two bugs are fixed alongside: (1) `createMember` now links an already-signed-up user immediately instead of leaving `userId = null`; (2) the `user.created` webhook no longer auto-provisions a second tenant when the user already has a membership (fixes seeded dummy users).

**Tech Stack:** Fastify 4, Drizzle ORM, Postgres, Vitest + Supertest, React 18, TanStack Query v5, Clerk React

---

## File map

| Action | Path | What changes |
|--------|------|-------------|
| Modify | `backend/src/db/schema.ts` | Add `invites` table + `Invite`/`NewInvite` types |
| Create | `backend/drizzle/0008_invites.sql` | Migration: CREATE TABLE invites |
| Modify | `backend/src/webhooks/clerk.ts` | Skip auto-provision if user already has any membership |
| Modify | `backend/src/members/service.ts` | Look up existing user by email in `createMember`; fix `importMembers` the same way |
| Create | `backend/src/invites/service.ts` | `createInvite`, `getInviteByToken`, `acceptInvite` |
| Create | `backend/src/invites/router.ts` | `POST /v1/invites`, `GET /v1/invites/:token`, `POST /v1/invites/:token/accept` |
| Modify | `backend/src/app.ts` | Register `invitesRouter` |
| Modify | `backend/src/scripts/seed-e2e.ts` | Truncate `invites` table at start |
| Modify | `backend/src/scripts/seed-fintech.ts` | Clear invites for tenant; rename tenant to FinCorp when found via existing admin |
| Modify | `admin/src/types.ts` | Add `InvitePreview` interface |
| Modify | `admin/src/api.ts` | Add `api.invites.*` |
| Modify | `admin/src/pages/MembersPage.tsx` | Replace inline add-member form with "Copy invite link" flow |
| Create | `admin/src/pages/InvitePage.tsx` | Public landing page at `/invite/:token` |
| Modify | `admin/src/App.tsx` | Add `/invite/:token` route outside `RequireAuth` |
| Modify | `README.md` | Fix outdated auth troubleshooting section |

---

## Task 1: Add `invites` table to schema

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Add the invites table and types after the `chatMessages` block**

  Open `backend/src/db/schema.ts`. After the `chatMessages` table definition (line ~211) and before the `// ── Types` section, insert:

  ```typescript
  // ── Invites ───────────────────────────────────────────────────────────────────
  export const invites = pgTable('invites', {
    id:            uuid('id').primaryKey().defaultRandom(),
    tenantId:      uuid('tenant_id').notNull().references(() => tenants.id),
    token:         text('token').notNull(),
    email:         text('email'),                              // null = open link
    role:          memberRoleEnum('role').notNull().default('member'),
    createdById:   uuid('created_by_id').references(() => members.id),
    expiresAt:     timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt:        timestamp('used_at', { withTimezone: true }),
    usedByUserId:  uuid('used_by_user_id').references(() => users.id),
    createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }, (t) => ({
    tokenUniq:  unique().on(t.token),
    tenantIdx:  index().on(t.tenantId),
  }))
  ```

  At the bottom of the `// ── Types` section, also add:

  ```typescript
  export type Invite    = typeof invites.$inferSelect
  export type NewInvite = typeof invites.$inferInsert
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```
  cd backend && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```
  git add backend/src/db/schema.ts
  git commit -m "feat(schema): add invites table"
  ```

---

## Task 2: Generate and apply the migration

**Files:**
- Create: `backend/drizzle/0008_invites.sql`

- [ ] **Step 1: Generate the migration**

  ```
  cd backend && npx drizzle-kit generate
  ```

  This creates `backend/drizzle/0008_invites.sql`. Open it and verify it contains a `CREATE TABLE "invites"` statement with columns matching the schema.

- [ ] **Step 2: Apply the migration to the local dev DB**

  ```
  cd backend && npm run db:migrate
  ```

  Expected output ends with: `Migrations complete`

- [ ] **Step 3: Commit**

  ```
  git add backend/drizzle/0008_invites.sql
  git commit -m "feat(migration): create invites table"
  ```

---

## Task 3: Fix webhook — skip auto-provision when user already has a membership

**Files:**
- Modify: `backend/src/webhooks/clerk.ts`

The bug: when a dummy member seeded by `seed-fintech.ts` (whose `members.userId` is already set) signs in to Clerk for the first time, the `user.created` webhook finds no **pending** members (because `userId` is already set, not null) and falls into the auto-provision path, creating a second tenant. Fix: check for **any** existing membership before the pending-member check.

- [ ] **Step 1: Add the early-exit check**

  In `backend/src/webhooks/clerk.ts`, in the `'user.created'` case, insert this block immediately after `if (!user) break`:

  ```typescript
  // If the user already has any membership (e.g. from seed-fintech), skip
  // both the pending-claim and auto-provision paths entirely.
  const [alreadyEnrolled] = await db.select({ id: members.id })
    .from(members)
    .where(eq(members.userId, user.id))
    .limit(1)
  if (alreadyEnrolled) break
  ```

  The full `'user.created'` case should now look like:

  ```typescript
  case 'user.created': {
    const { id, first_name, last_name, image_url, email_addresses } = event.data
    const email = email_addresses[0]?.email_address ?? ''
    if (!email) break

    const user = await createUser({
      clerkId:   id,
      email,
      firstName: first_name ?? undefined,
      lastName:  last_name  ?? undefined,
      avatarUrl: image_url  || undefined,
    })
    if (!user) break

    // If the user already has any membership (e.g. from seed-fintech), skip.
    const [alreadyEnrolled] = await db.select({ id: members.id })
      .from(members)
      .where(eq(members.userId, user.id))
      .limit(1)
    if (alreadyEnrolled) break

    // Check for pre-enrolled members (userId = null) matching this email
    const pending = await db.select({ id: members.id })
      .from(members)
      .where(and(eq(members.email, email), isNull(members.userId)))

    if (pending.length > 0) {
      await claimPendingMembers(email, user.id)
    } else {
      // No pre-enrollment — auto-provision a tenant for this user
      const localPart = email.split('@')[0] ?? email
      const base = localPart.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
      const suffix = Math.random().toString(36).slice(2, 7)
      const slug = `${base}-${suffix}`

      const orgSecret   = generateSecret()
      const adminSecret = generateSecret()

      const [tenant] = await db.insert(tenants).values({
        name:               `${first_name ?? localPart}'s Organization`,
        slug,
        orgTokenHash:       await hashToken(orgSecret),
        adminTokenHash:     await hashToken(adminSecret),
        paymentProvider:    'stripe',
        externalSubId:      `sub_auto_${slug}`,
        subscriptionStatus: 'active',
        plan:               'pro',
      }).returning({ id: tenants.id })

      await db.insert(members).values({
        tenantId: tenant!.id,
        userId:   user.id,
        email,
        role:     'super_admin',
      })
    }
    break
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```
  cd backend && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```
  git add backend/src/webhooks/clerk.ts
  git commit -m "fix(webhook): skip auto-provision when user already enrolled"
  ```

---

## Task 4: Fix `createMember` — link existing user immediately

**Files:**
- Modify: `backend/src/members/service.ts`

The bug: when an admin adds an email via the Members page for a user who already has a Clerk account, `createMember` leaves `userId = null`. The middleware does `WHERE members.userId = user.id` so that user can never find the new membership. Fix: look up `users` by email and set `userId` if found.

- [ ] **Step 1: Add the import for `getUserByEmail`**

  At the top of `backend/src/members/service.ts`, add:

  ```typescript
  import { getUserByEmail } from '../users/service.js'
  ```

- [ ] **Step 2: Update `createMember` to link existing users**

  Replace the current `createMember` function:

  ```typescript
  export async function createMember(
    tenantId: string,
    data: Pick<NewMember, 'email' | 'displayName' | 'role'>
  ): Promise<Member> {
    const existingUser = await getUserByEmail(data.email)
    const [row] = await db.insert(members).values({
      tenantId,
      ...data,
      userId: existingUser?.id ?? null,
    }).returning()
    return row!
  }
  ```

- [ ] **Step 3: Update `importMembers` the same way**

  Replace the current `importMembers` function:

  ```typescript
  export async function importMembers(
    tenantId: string,
    rows: Array<{ email: string; displayName?: string }>
  ): Promise<Member[]> {
    if (rows.length === 0) return []
    const toInsert = await Promise.all(rows.map(async r => {
      const existingUser = await getUserByEmail(r.email)
      return {
        tenantId,
        email:       r.email,
        displayName: r.displayName ?? null,
        role:        'member' as const,
        userId:      existingUser?.id ?? null,
      }
    }))
    return db.insert(members).values(toInsert).onConflictDoNothing().returning()
  }
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```
  cd backend && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```
  git add backend/src/members/service.ts
  git commit -m "fix(members): link existing user by email on createMember"
  ```

---

## Task 5: Create invites service

**Files:**
- Create: `backend/src/invites/service.ts`

- [ ] **Step 1: Create the file**

  Create `backend/src/invites/service.ts`:

  ```typescript
  import { randomBytes } from 'node:crypto'
  import { and, eq, isNull, gt } from 'drizzle-orm'
  import { db } from '../db/client.js'
  import { invites, members, tenants, users, type Invite } from '../db/schema.js'

  const INVITE_TTL_MS = 72 * 60 * 60 * 1000 // 72 hours

  function generateToken(): string {
    return randomBytes(32).toString('hex')
  }

  export interface InvitePreview {
    tenantName: string
    role:       string
    email:      string | null
    expiresAt:  string
    valid:      boolean
  }

  export async function createInvite(
    tenantId:    string,
    createdById: string,
    opts: { email?: string; role?: Invite['role'] }
  ): Promise<{ token: string; expiresAt: Date }> {
    const token     = generateToken()
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    await db.insert(invites).values({
      tenantId,
      token,
      email:       opts.email ?? null,
      role:        opts.role ?? 'member',
      createdById,
      expiresAt,
    })
    return { token, expiresAt }
  }

  export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
    const now = new Date()
    const [row] = await db
      .select({ invite: invites, tenantName: tenants.name })
      .from(invites)
      .innerJoin(tenants, eq(invites.tenantId, tenants.id))
      .where(eq(invites.token, token))
      .limit(1)

    if (!row) return null

    const valid = !row.invite.usedAt && row.invite.expiresAt > now
    return {
      tenantName: row.tenantName,
      role:       row.invite.role,
      email:      row.invite.email,
      expiresAt:  row.invite.expiresAt.toISOString(),
      valid,
    }
  }

  export async function acceptInvite(
    token:  string,
    userId: string
  ): Promise<{ member: typeof members.$inferSelect } | { error: string }> {
    const now = new Date()
    const [row] = await db
      .select()
      .from(invites)
      .where(eq(invites.token, token))
      .limit(1)

    if (!row)                          return { error: 'Invite not found' }
    if (row.usedAt)                    return { error: 'Invite already used' }
    if (row.expiresAt < now)           return { error: 'Invite expired' }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) return { error: 'User not found' }

    // Email restriction check
    if (row.email && row.email.toLowerCase() !== user.email.toLowerCase()) {
      return { error: 'This invite is restricted to a different email address' }
    }

    // Check if already a member of this tenant
    const [existing] = await db
      .select()
      .from(members)
      .where(and(eq(members.tenantId, row.tenantId), eq(members.userId, userId)))
      .limit(1)

    if (existing) {
      // Already a member — mark invite used and return existing membership
      await db.update(invites)
        .set({ usedAt: now, usedByUserId: userId })
        .where(eq(invites.token, token))
      return { member: existing }
    }

    // Enroll
    const [member] = await db.insert(members).values({
      tenantId:    row.tenantId,
      userId,
      email:       user.email,
      displayName: user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : undefined,
      role: row.role,
    }).returning()

    await db.update(invites)
      .set({ usedAt: now, usedByUserId: userId })
      .where(eq(invites.token, token))

    return { member: member! }
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```
  cd backend && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```
  git add backend/src/invites/service.ts
  git commit -m "feat(invites): add invite service — create, preview, accept"
  ```

---

## Task 6: Create invites router and register it

**Files:**
- Create: `backend/src/invites/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create the router**

  Create `backend/src/invites/router.ts`:

  ```typescript
  import type { FastifyInstance } from 'fastify'
  import { requireAdminTokenOrClerkAdmin, requireClerkAuth } from '../auth/middleware.js'
  import { createInvite, getInvitePreview, acceptInvite } from './service.js'

  const BASE_URL = process.env.ADMIN_BASE_URL ?? 'http://localhost:5173'

  export async function invitesRouter(fastify: FastifyInstance): Promise<void> {
    // Admin creates an invite link
    fastify.post('/invites', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
      if (!req.member) return reply.status(403).send({ error: 'Clerk auth required' })
      const body = req.body as { email?: string; role?: string }
      const role = (body.role ?? 'member') as 'member' | 'division_admin' | 'super_admin'
      const { token, expiresAt } = await createInvite(req.tenant.id, req.member.id, {
        email: body.email?.trim() || undefined,
        role,
      })
      return reply.status(201).send({
        token,
        url:       `${BASE_URL}/invite/${token}`,
        expiresAt: expiresAt.toISOString(),
      })
    })

    // Public — returns invite preview for the landing page (no auth required)
    fastify.get('/invites/:token', async (req, reply) => {
      const { token } = req.params as { token: string }
      const preview = await getInvitePreview(token)
      if (!preview) return reply.status(404).send({ error: 'Invite not found' })
      return preview
    })

    // Authenticated user accepts an invite
    fastify.post('/invites/:token/accept', { preHandler: requireClerkAuth }, async (req, reply) => {
      const { token } = req.params as { token: string }
      if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })
      const result = await acceptInvite(token, req.user.id)
      if ('error' in result) return reply.status(400).send({ error: result.error })
      return reply.status(200).send(result.member)
    })
  }
  ```

- [ ] **Step 2: Register the router in `app.ts`**

  In `backend/src/app.ts`, add the import at the top with the other imports:

  ```typescript
  import { invitesRouter } from './invites/router.js'
  ```

  Then register it with the other routers (after `assistantRouter`):

  ```typescript
  void app.register(invitesRouter, { prefix: '/v1' })
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```
  cd backend && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Smoke-test with curl (backend must be running: `cd backend && npm run dev`)**

  ```
  # Get a preview for a non-existent token — should 404
  curl -s http://localhost:3000/v1/invites/doesnotexist | jq .
  ```

  Expected: `{"error":"Invite not found"}`

- [ ] **Step 5: Commit**

  ```
  git add backend/src/invites/router.ts backend/src/app.ts
  git commit -m "feat(invites): add invite router — create, preview, accept endpoints"
  ```

---

## Task 7: Update seed scripts

**Files:**
- Modify: `backend/src/scripts/seed-e2e.ts`
- Modify: `backend/src/scripts/seed-fintech.ts`

### 7a — seed-e2e.ts

- [ ] **Step 1: Add `invites` to the truncation block**

  In `backend/src/scripts/seed-e2e.ts`, add `invites` to the imports:

  ```typescript
  import {
    tenants, divisions, teams, users, members, memberTeams,
    subjects, rules, policies,
    destinationGroups, siteConfigs, events, scans,
    chatSessions, chatMessages, invites,
  } from '../db/schema.js'
  ```

  Add the delete call to the truncation block, immediately before `await db.delete(chatMessages)`:

  ```typescript
  await db.delete(invites)
  await db.delete(chatMessages)
  ```

### 7b — seed-fintech.ts

- [ ] **Step 2: Add `invites` to the imports in seed-fintech.ts**

  Change the existing import line:

  ```typescript
  import {
    tenants, divisions, teams, users, members, memberTeams,
    subjects, rules, siteConfigs, events, scans, invites,
  } from '../db/schema.js'
  ```

- [ ] **Step 3: Clear invites and rename tenant to "FinCorp" when reusing an existing tenant**

  In the `// 3. Clear existing seed data` block (around line 148), add `invites` clearing:

  ```typescript
  await db.delete(invites).where(eq(invites.tenantId, tenantId))
  await db.delete(events).where(eq(events.tenantId, tenantId))
  await db.delete(scans).where(eq(scans.tenantId, tenantId))
  ```

  Also, right after the `tenantId` is resolved from the existing member row (the `if (adminMemberRow)` branch, around line 89), update the tenant name and slug to FinCorp so the seed always produces a consistently named org:

  ```typescript
  if (adminMemberRow) {
    tenantId = adminMemberRow.tenantId
    // Rename to FinCorp in case this tenant was auto-provisioned with a different name
    await db.update(tenants)
      .set({ name: 'FinCorp', slug: 'fincorp' })
      .where(eq(tenants.id, tenantId))
  }
  ```

- [ ] **Step 4: Verify TypeScript compiles for both scripts**

  ```
  cd backend && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```
  git add backend/src/scripts/seed-e2e.ts backend/src/scripts/seed-fintech.ts
  git commit -m "fix(seed): truncate invites table; rename auto-provisioned tenant to FinCorp"
  ```

---

## Task 8: Update admin frontend — types and API client

**Files:**
- Modify: `admin/src/types.ts`
- Modify: `admin/src/api.ts`

- [ ] **Step 1: Add `InvitePreview` and `InviteCreated` to types.ts**

  At the bottom of `admin/src/types.ts`, add:

  ```typescript
  export interface InvitePreview {
    tenantName: string
    role:       string
    email:      string | null
    expiresAt:  string
    valid:      boolean
  }

  export interface InviteCreated {
    token:     string
    url:       string
    expiresAt: string
  }
  ```

- [ ] **Step 2: Add `api.invites` to api.ts**

  In `admin/src/api.ts`, add the import for the new types at the top (inside the existing type import):

  ```typescript
  import type {
    Subject, Rule, Division, Team, Member,
    DestinationGroup, SiteConfig, PolicyInfo, PolicyHistoryEntry, TenantInfo,
    AnalyticsSummary, AnalyticsDailyEntry, AnalyticsIncident,
    AnalyticsTopSiteEntry, AnalyticsBySubjectEntry,
    AuditLogPage,
    ChatSession, ChatMessage, AssistantChatResponse, AssistantApplyResponse,
    InvitePreview, InviteCreated,
  } from './types'
  ```

  Then, inside the `export const api = { ... }` object, add an `invites` section after `assistant`:

  ```typescript
  invites: {
    create: (opts: { email?: string; role?: Member['role'] }) =>
      request<InviteCreated>('POST', '/v1/invites', opts),
    preview: (token: string) =>
      request<InvitePreview>('GET', `/v1/invites/${token}`),
    accept: (token: string) =>
      request<Member>('POST', `/v1/invites/${token}/accept`, {}),
  },
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```
  cd admin && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```
  git add admin/src/types.ts admin/src/api.ts
  git commit -m "feat(admin): add InvitePreview/InviteCreated types and api.invites client"
  ```

---

## Task 9: Update MembersPage — replace add-member form with invite link generation

**Files:**
- Modify: `admin/src/pages/MembersPage.tsx`

The current "Add Member" inline form calls `api.members.create()` directly, which is the broken path for already-signed-up users. Replace it with an invite link flow: admin picks role (and optionally email), clicks "Generate link", and gets a copyable URL. The member row is created when the invitee redeems the link — not before.

- [ ] **Step 1: Replace MembersPage.tsx with the updated version**

  Replace the full content of `admin/src/pages/MembersPage.tsx` with:

  ```tsx
  import { useState } from 'react'
  import { useMutation } from '@tanstack/react-query'
  import { PageHeader } from '../components/ui/PageHeader'
  import { InlineLoader } from '../components/ui/Spinner'
  import { ConfirmModal } from '../components/ui/ConfirmModal'
  import { useMembers, useMemberActions } from '../hooks/useMembers'
  import { api } from '../api'
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
    const { update, remove } = useMemberActions()

    const [showInvite, setShowInvite]         = useState(false)
    const [inviteEmail, setInviteEmail]       = useState('')
    const [inviteRole, setInviteRole]         = useState<Member['role']>('member')
    const [generatedUrl, setGeneratedUrl]     = useState<string | null>(null)
    const [copied, setCopied]                 = useState(false)

    const [editingId, setEditingId]           = useState<string | null>(null)
    const [editRole, setEditRole]             = useState<Member['role']>('member')
    const [confirmRemove, setConfirmRemove]   = useState<Member | null>(null)

    const generateInvite = useMutation({
      mutationFn: () => api.invites.create({
        email: inviteEmail.trim() || undefined,
        role:  inviteRole,
      }),
      onSuccess: (data) => setGeneratedUrl(data.url),
    })

    function handleGenerate(e: React.FormEvent) {
      e.preventDefault()
      setGeneratedUrl(null)
      setCopied(false)
      generateInvite.mutate()
    }

    function copyLink() {
      if (!generatedUrl) return
      void navigator.clipboard.writeText(generatedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

    function resetInvite() {
      setShowInvite(false)
      setInviteEmail('')
      setInviteRole('member')
      setGeneratedUrl(null)
      setCopied(false)
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
              onClick={() => { setShowInvite(s => !s); setGeneratedUrl(null) }}
              style={{
                background: 'var(--brand-primary)', color: '#fff', border: 'none',
                borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              + Invite Member
            </button>
          }
        />

        {showInvite && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 16, marginBottom: 16,
          }}>
            {!generatedUrl ? (
              <form onSubmit={handleGenerate} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Email (optional — leave blank for open link)</span>
                  <input
                    type="email" value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="alice@lawfirm.com"
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
                  type="submit" disabled={generateInvite.isPending}
                  style={{
                    background: 'var(--brand-primary)', color: '#fff', border: 'none',
                    borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {generateInvite.isPending ? 'Generating…' : 'Generate link'}
                </button>
                <button
                  type="button" onClick={resetInvite}
                  style={{
                    background: 'transparent', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    padding: '7px 16px', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Share this link — it expires in 72 hours and can be used once.
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    readOnly value={generatedUrl}
                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={copyLink}
                    style={{
                      background: copied ? 'var(--status-success, #16a34a)' : 'var(--brand-primary)',
                      color: '#fff', border: 'none', borderRadius: 6,
                      padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    onClick={resetInvite}
                    style={{
                      background: 'transparent', color: 'var(--text-muted)',
                      border: '1px solid var(--border)', borderRadius: 6,
                      padding: '7px 16px', fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {isLoading && <InlineLoader />}
          {!isLoading && members.length === 0 && (
            <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
              No members yet. Click <strong>+ Invite Member</strong> to get started.
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

- [ ] **Step 2: Verify TypeScript compiles**

  ```
  cd admin && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```
  git add admin/src/pages/MembersPage.tsx
  git commit -m "feat(members): replace add-member form with invite link generation"
  ```

---

## Task 10: Add public invite landing page

**Files:**
- Create: `admin/src/pages/InvitePage.tsx`
- Modify: `admin/src/App.tsx`

The page is public (no RequireAuth). It fetches the invite preview from the backend. If the Clerk session is active it shows an "Accept and join" button; otherwise it shows "Sign in to accept" which links to `/login` with a `?redirect=` param so after sign-in Clerk redirects back here.

- [ ] **Step 1: Create InvitePage.tsx**

  Create `admin/src/pages/InvitePage.tsx`:

  ```tsx
  import { useState } from 'react'
  import { useParams, useNavigate } from 'react-router-dom'
  import { useQuery, useMutation } from '@tanstack/react-query'
  import { useAuth } from '@clerk/clerk-react'
  import { api } from '../api'

  export function InvitePage() {
    const { token } = useParams<{ token: string }>()
    const navigate  = useNavigate()
    const { isSignedIn, isLoaded } = useAuth()
    const [accepted, setAccepted]  = useState(false)
    const [error, setError]        = useState<string | null>(null)

    const { data: preview, isLoading, isError } = useQuery({
      queryKey: ['invite-preview', token],
      queryFn:  () => api.invites.preview(token!),
      enabled:  !!token,
      retry: false,
    })

    const accept = useMutation({
      mutationFn: () => api.invites.accept(token!),
      onSuccess: () => { setAccepted(true); setTimeout(() => navigate('/dashboard'), 2000) },
      onError: (err: Error) => setError(err.message),
    })

    const containerStyle: React.CSSProperties = {
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base, #0f1117)',
    }
    const cardStyle: React.CSSProperties = {
      background: 'var(--bg-surface, #1a1d27)', border: '1px solid var(--border, #2a2d3a)',
      borderRadius: 16, padding: '40px 48px', maxWidth: 440, width: '100%',
      display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center',
    }
    const titleStyle: React.CSSProperties = {
      fontSize: 22, fontWeight: 700, color: 'var(--text-primary, #e8eaf0)', margin: 0,
    }
    const subtitleStyle: React.CSSProperties = {
      fontSize: 14, color: 'var(--text-muted, #6b7280)', margin: 0,
    }
    const btnStyle: React.CSSProperties = {
      background: 'var(--brand-primary, #6c47ff)', color: '#fff', border: 'none',
      borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600,
      cursor: 'pointer', width: '100%',
    }

    if (isLoading || !isLoaded) {
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <p style={subtitleStyle}>Loading…</p>
          </div>
        </div>
      )
    }

    if (isError || !preview) {
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <h1 style={titleStyle}>Invite not found</h1>
            <p style={subtitleStyle}>This link is invalid or has expired.</p>
          </div>
        </div>
      )
    }

    if (!preview.valid) {
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <h1 style={titleStyle}>Invite expired</h1>
            <p style={subtitleStyle}>This invite link is no longer valid. Ask your admin to generate a new one.</p>
          </div>
        </div>
      )
    }

    if (accepted) {
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <h1 style={titleStyle}>Welcome to {preview.tenantName}!</h1>
            <p style={subtitleStyle}>You're now a member. Redirecting to the dashboard…</p>
          </div>
        </div>
      )
    }

    const roleLabel = preview.role === 'super_admin' ? 'Super Admin'
      : preview.role === 'division_admin' ? 'Division Admin'
      : 'Member'

    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>You're invited to join</h1>
          <p style={{ ...titleStyle, fontSize: 26 }}>{preview.tenantName}</p>
          <p style={subtitleStyle}>
            Role: <strong style={{ color: 'var(--text-primary, #e8eaf0)' }}>{roleLabel}</strong>
            {preview.email && (
              <> · Restricted to <strong style={{ color: 'var(--text-primary, #e8eaf0)' }}>{preview.email}</strong></>
            )}
          </p>
          <p style={{ ...subtitleStyle, fontSize: 11 }}>
            Expires {new Date(preview.expiresAt).toLocaleDateString()}
          </p>

          {error && (
            <p style={{ color: 'var(--status-danger, #ef4444)', fontSize: 13, margin: 0 }}>{error}</p>
          )}

          {isSignedIn ? (
            <button
              style={btnStyle}
              disabled={accept.isPending}
              onClick={() => accept.mutate()}
            >
              {accept.isPending ? 'Joining…' : `Accept and join ${preview.tenantName}`}
            </button>
          ) : (
            <a
              href={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}
              style={{ ...btnStyle, display: 'block', textDecoration: 'none', lineHeight: '1.4' }}
            >
              Sign in to accept
            </a>
          )}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 2: Add the `/invite/:token` route in App.tsx**

  In `admin/src/App.tsx`, add the import:

  ```typescript
  import { InvitePage } from './pages/InvitePage'
  ```

  Inside the `<Routes>` block, add a public route **before** the `RequireAuth` block:

  ```tsx
  <Route path="/invite/:token" element={<InvitePage />} />
  ```

  The `<Routes>` block should look like:

  ```tsx
  <Routes>
    <Route path="/login"          element={<LoginPage />} />
    <Route path="/unauthorized"   element={<UnauthorizedPage />} />
    <Route path="/onboarding"     element={<OnboardingPage />} />
    <Route path="/invite/:token"  element={<InvitePage />} />
    <Route
      element={
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      }
    >
      {/* ... existing routes unchanged ... */}
    </Route>
  </Routes>
  ```

- [ ] **Step 3: Handle the `?redirect=` param in LoginPage so Clerk sends users back to the invite**

  Open `admin/src/pages/LoginPage.tsx` and read it. If it contains a Clerk `<SignIn>` component, add `redirectUrl` from the query string. The exact change depends on the current LoginPage — read the file first, then apply this pattern:

  ```tsx
  // At the top of LoginPage, read the redirect param:
  const redirect = new URLSearchParams(window.location.search).get('redirect') ?? '/dashboard'

  // Pass it to the Clerk SignIn component:
  <SignIn redirectUrl={redirect} />
  // or if using useSignIn hook:
  // signIn.authenticateWithRedirect({ redirectUrl: redirect, ... })
  ```

  Read the file and apply the appropriate change without breaking existing sign-in behaviour.

- [ ] **Step 4: Verify TypeScript compiles**

  ```
  cd admin && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```
  git add admin/src/pages/InvitePage.tsx admin/src/App.tsx admin/src/pages/LoginPage.tsx
  git commit -m "feat(invite): public /invite/:token landing page with Clerk sign-in flow"
  ```

---

## Task 11: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Fix the auth troubleshooting section**

  In `README.md`, replace the entire `## Auth troubleshooting` section (lines ~132–145) with:

  ```markdown
  ## Auth troubleshooting

  If you see 401 errors in the admin dashboard, your DB rows are likely out of sync with Clerk. Run:

  ```sh
  npm run check-db
  ```

  This shows your `tenants` and `members` tables. You need:
  - A row in `users` with `clerk_id` matching your Clerk user ID
  - A row in `members` linking that user to a tenant

  If either is missing, re-run `npm run db:setup` — the seed script creates both rows automatically when it detects your Clerk user.

  > **Note:** The system no longer uses Clerk organisations. Identity is managed via the `users` table (keyed on `clerk_id`) and tenant membership via the `members` table.
  ```

- [ ] **Step 2: Add invite flow to Useful commands table**

  In the `## Useful commands` table, add a row:

  ```markdown
  | `cd backend && npm run seed:fintech` | Reseed FinCorp demo data and re-publish policy |
  ```

  (This row already exists — verify it's there; if not, add it.)

- [ ] **Step 3: Commit**

  ```
  git add README.md
  git commit -m "docs: fix auth troubleshooting section, remove stale clerk_org_id references"
  ```

---

## Task 12: Run E2E tests and confirm all pass

- [ ] **Step 1: Build the admin and extension**

  ```
  npm run build
  ```

  Expected: exits 0, `dist/` folder updated.

- [ ] **Step 2: Run the full E2E suite**

  ```
  npm run test:e2e
  ```

  Expected: `79 passed` (or more if new tests were added), `0 failed`.

- [ ] **Step 3: If any E2E tests fail related to members or invites, diagnose and fix**

  Common failure: members E2E test still uses the old "Add Member" button label `+ Add Member` — it now reads `+ Invite Member`. Update `e2e/admin/members.spec.ts` locators accordingly if needed.

---

## Self-review

**Spec coverage check:**
- ✅ Invite link creation (POST /v1/invites) — Task 6
- ✅ Invite preview (GET /v1/invites/:token, public) — Task 6
- ✅ Invite acceptance by authenticated user — Task 6
- ✅ Landing page at /invite/:token — Task 10
- ✅ Admin UI generate/copy invite link — Task 9
- ✅ Bug fix: createMember links existing user — Task 4
- ✅ Bug fix: webhook skips auto-provision for enrolled users — Task 3
- ✅ seed-e2e.ts truncates invites — Task 7a
- ✅ seed-fintech.ts clears invites, renames tenant to FinCorp — Task 7b
- ✅ README auth troubleshooting updated — Task 11
- ✅ Invite expires in 72 h — Task 5 (`INVITE_TTL_MS`)
- ✅ Email restriction on invite — Task 5 (`acceptInvite` email check)
- ✅ Already-a-member idempotency — Task 5 (`acceptInvite` existing check)
- ✅ Redirect back to invite page after sign-in — Task 10 Step 3

**Placeholder scan:** None found.

**Type consistency check:**
- `InviteCreated` (types.ts) matches the shape returned by `POST /v1/invites` in router.ts: `{ token, url, expiresAt }` ✅
- `InvitePreview` (types.ts) matches `getInvitePreview` return shape in service.ts ✅
- `api.invites.accept` returns `Member` — `acceptInvite` in service returns `members.$inferSelect` which maps to `Member` ✅
- `Invite['role']` used in service.ts is `memberRoleEnum` values — same enum as `Member['role']` in types.ts ✅
