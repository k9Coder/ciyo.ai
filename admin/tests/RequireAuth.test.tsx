import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, Navigate: ({ to }: { to: string }) => <div data-testid={`redirect:${to}`} /> }
})

import { useAuth } from '@clerk/react'
import { RequireAuth } from '../src/components/layout/RequireAuth'

beforeEach(() => { vi.clearAllMocks() })

describe('RequireAuth', () => {
  it('shows loading when Clerk is not ready', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: false, isSignedIn: false, orgId: null, orgRole: null, getToken: vi.fn() } as any)
    render(<MemoryRouter><RequireAuth><div>child</div></RequireAuth></MemoryRouter>)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('redirects to /login when not signed in', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: false, orgId: null, orgRole: null, getToken: vi.fn() } as any)
    render(<MemoryRouter><RequireAuth><div>child</div></RequireAuth></MemoryRouter>)
    expect(screen.getByTestId('redirect:/login')).toBeInTheDocument()
  })

  it('redirects to /onboarding when signed in but no org', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: null, orgRole: null, getToken: vi.fn() } as any)
    render(<MemoryRouter><RequireAuth><div>child</div></RequireAuth></MemoryRouter>)
    expect(screen.getByTestId('redirect:/onboarding')).toBeInTheDocument()
  })

  it('redirects to /unauthorized when has org but not admin', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: 'org_123', orgRole: 'org:member', getToken: vi.fn() } as any)
    render(<MemoryRouter><RequireAuth><div>child</div></RequireAuth></MemoryRouter>)
    expect(screen.getByTestId('redirect:/unauthorized')).toBeInTheDocument()
  })

  it('renders children when signed in as org admin', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: 'org_123', orgRole: 'org:admin', getToken: vi.fn() } as any)
    render(<MemoryRouter><RequireAuth><div>child content</div></RequireAuth></MemoryRouter>)
    expect(screen.getByText('child content')).toBeInTheDocument()
  })
})
