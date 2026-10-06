import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../src/hooks/useWireAuthToken', () => ({ useWireAuthToken: vi.fn() }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, Navigate: ({ to }: { to: string }) => <div data-testid={`redirect:${to}`} /> }
})

import { useWireAuthToken } from '../src/hooks/useWireAuthToken'
import { RequireAuth } from '../src/components/layout/RequireAuth'

beforeEach(() => { vi.clearAllMocks() })

describe('RequireAuth', () => {
  it('shows loading when Clerk is not ready', () => {
    vi.mocked(useWireAuthToken).mockReturnValue({ isLoaded: false, isSignedIn: false })
    render(<MemoryRouter><RequireAuth><div>child</div></RequireAuth></MemoryRouter>)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('redirects to /login when not signed in', () => {
    vi.mocked(useWireAuthToken).mockReturnValue({ isLoaded: true, isSignedIn: false })
    render(<MemoryRouter><RequireAuth><div>child</div></RequireAuth></MemoryRouter>)
    expect(screen.getByTestId('redirect:/login')).toBeInTheDocument()
  })

  it('renders children when signed in', () => {
    vi.mocked(useWireAuthToken).mockReturnValue({ isLoaded: true, isSignedIn: true })
    render(<MemoryRouter><RequireAuth><div>child content</div></RequireAuth></MemoryRouter>)
    expect(screen.getByText('child content')).toBeInTheDocument()
  })
})
