import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../src/api', () => ({
  api: {
    members: { list: vi.fn(), update: vi.fn(), remove: vi.fn(), create: vi.fn() },
    // invites.create intentionally not mocked — token-invite-link flow
    // retired, MembersPage no longer calls it (see src/App.tsx).
    divisions: { list: vi.fn() },
  },
}))

import { api } from '../src/api'
import { MembersPage } from '../src/pages/MembersPage'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MembersPage />
    </QueryClientProvider>
  )
}

const MEMBER = {
  id: 'm1', tenantId: 't1', email: 'alice@example.com', displayName: 'Alice',
  firstName: null, lastName: null, role: 'member' as const, adminDivisionId: null,
  clerkId: null, failMode: null, createdAt: new Date().toISOString(),
  desktopLastSignInAt: null as string | null, desktopLastSignOutAt: null as string | null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.members.list).mockResolvedValue([MEMBER])
  vi.mocked(api.members.update).mockResolvedValue({ ...MEMBER, failMode: 'closed' })
  vi.mocked(api.divisions.list).mockResolvedValue([])
})

describe('MembersPage fail mode', () => {
  it('defaults the select to "Org default" when the member has no override', async () => {
    renderPage()
    const select = await screen.findByDisplayValue('Org default')
    expect(select).toBeInTheDocument()
  })

  it('sends the member-level override when changed', async () => {
    renderPage()
    const select = await screen.findByDisplayValue('Org default') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'closed' } })

    await waitFor(() => expect(api.members.update).toHaveBeenCalledWith('m1', { failMode: 'closed' }))
  })

  it('sends null to clear an override back to org default', async () => {
    vi.mocked(api.members.list).mockResolvedValue([{ ...MEMBER, failMode: 'closed' }])
    renderPage()
    const select = await screen.findByDisplayValue('Fail closed') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '' } })

    await waitFor(() => expect(api.members.update).toHaveBeenCalledWith('m1', { failMode: null }))
  })
})

describe('MembersPage desktop sign-in / sign-out', () => {
  it('shows a dash when the member never used the desktop app', async () => {
    renderPage()
    await screen.findByText('alice@example.com')
    expect(screen.queryByText('Signed in')).not.toBeInTheDocument()
    expect(screen.queryByText('Signed out')).not.toBeInTheDocument()
  })

  it('shows "Signed in" with the last sign-in time when they have not signed out since', async () => {
    vi.mocked(api.members.list).mockResolvedValue([{
      ...MEMBER, desktopLastSignInAt: '2026-09-19T10:00:00.000Z', desktopLastSignOutAt: '2026-09-18T10:00:00.000Z',
    }])
    renderPage()
    expect(await screen.findByText('Signed in')).toBeInTheDocument()
  })

  it('shows "Signed out" when the newest event is a sign-out', async () => {
    vi.mocked(api.members.list).mockResolvedValue([{
      ...MEMBER, desktopLastSignInAt: '2026-09-18T10:00:00.000Z', desktopLastSignOutAt: '2026-09-19T10:00:00.000Z',
    }])
    renderPage()
    expect(await screen.findByText('Signed out')).toBeInTheDocument()
  })
})

describe('MembersPage add member', () => {
  it('adds a member directly by email — no invite link generated', async () => {
    vi.mocked(api.members.create).mockResolvedValue({ ...MEMBER, id: 'm2', email: 'new@example.com' })
    renderPage()

    fireEvent.click(await screen.findByText('+ Add Member'))
    fireEvent.change(screen.getByPlaceholderText('alice@lawfirm.com'), { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByText('Add member'))

    await waitFor(() => expect(api.members.create).toHaveBeenCalledWith({
      email: 'new@example.com', role: 'member', adminDivisionId: undefined,
    }))
    // No "Generate link" / "Copy link" UI exists anymore.
    expect(screen.queryByText('Copy link')).not.toBeInTheDocument()
  })
})
