import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useParams: () => ({ token: 'tok_123' }) }
})
vi.mock('../src/api', () => ({
  api: { invites: { preview: vi.fn(), accept: vi.fn() } },
}))
vi.mock('../src/lib/tenant', () => ({ setSelectedTenantId: vi.fn() }))

import { useAuth } from '@clerk/react'
import { api } from '../src/api'
import { setSelectedTenantId } from '../src/lib/tenant'
import { InvitePage } from '../src/pages/InvitePage'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><InvitePage /></MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({ isSignedIn: true, isLoaded: true } as any)
  vi.mocked(api.invites.preview).mockResolvedValue({
    tenantName: 'Acme', role: 'member', email: null,
    expiresAt: new Date(Date.now() + 86400000).toISOString(), valid: true,
  } as any)
})

describe('InvitePage accept', () => {
  it('sets the selected tenant from the returned member row', async () => {
    vi.mocked(api.invites.accept).mockResolvedValue({ id: 'm1', tenantId: 'tenant_new' } as any)
    renderPage()
    const btn = await screen.findByRole('button', { name: /accept and join/i })
    fireEvent.click(btn)
    await waitFor(() => expect(setSelectedTenantId).toHaveBeenCalledWith('tenant_new'))
    expect(api.invites.accept).toHaveBeenCalledWith('tok_123')
  })
})
