import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
const mockCreateOrganization = vi.fn()

vi.mock('@clerk/react', () => ({ useAuth: vi.fn(), useOrganizationList: vi.fn() }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { useAuth, useOrganizationList } from '@clerk/react'
import { OnboardingPage } from '../src/pages/OnboardingPage'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useOrganizationList).mockReturnValue({ isLoaded: true, createOrganization: mockCreateOrganization } as any)
})

describe('OnboardingPage', () => {
  it('redirects to /login when not signed in', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: false, orgId: null } as any)
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('redirects to /dashboard when already has an org', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: 'org_existing' } as any)
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
  })

  it('renders the org creation form when signed in with no org', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: null } as any)
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    expect(screen.getByPlaceholderText(/company name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create organization/i })).toBeInTheDocument()
  })

  it('auto-generates slug from company name', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: null } as any)
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/company name/i), { target: { value: 'Acme Law LLP' } })
    expect(screen.getByDisplayValue('acme-law-llp')).toBeInTheDocument()
  })

  it('calls createOrganization with name and slug on submit', async () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: null } as any)
    mockCreateOrganization.mockResolvedValue({ id: 'org_new' })
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/company name/i), { target: { value: 'Acme Law LLP' } })
    fireEvent.click(screen.getByRole('button', { name: /create organization/i }))
    await waitFor(() => expect(mockCreateOrganization).toHaveBeenCalledWith({ name: 'Acme Law LLP', slug: 'acme-law-llp' }))
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding/profile', { replace: true })
  })

  it('shows an error message when org creation fails', async () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: null } as any)
    mockCreateOrganization.mockRejectedValue(new Error('Slug already taken'))
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/company name/i), { target: { value: 'Acme Law LLP' } })
    fireEvent.click(screen.getByRole('button', { name: /create organization/i }))
    await waitFor(() => expect(screen.getByText(/slug already taken/i)).toBeInTheDocument())
  })
})
