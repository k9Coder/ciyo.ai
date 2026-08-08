import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../src/api', () => ({
  api: {
    members: { list: vi.fn(), update: vi.fn(), remove: vi.fn(), create: vi.fn() },
    invites: { create: vi.fn() },
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
