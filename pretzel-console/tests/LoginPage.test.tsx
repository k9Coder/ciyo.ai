import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
let authState = { isLoaded: true, isSignedIn: false }
const signInProps = vi.fn()
const signUpProps = vi.fn()

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => mockNavigate,
}))
vi.mock('@clerk/react', () => ({
  useAuth: () => authState,
  SignIn: (p: unknown) => { signInProps(p); return <div data-testid="clerk-sign-in" /> },
  SignUp: (p: unknown) => { signUpProps(p); return <div data-testid="clerk-sign-up" /> },
}))

import { LoginPage } from '../src/pages/LoginPage'

const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><LoginPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  authState = { isLoaded: true, isSignedIn: false }
})

describe('LoginPage', () => {
  it('embeds Clerk <SignIn /> with the design heading and a link to set up an organization', () => {
    renderAt('/login')
    expect(screen.getByRole('heading', { name: 'Sign in to the console' })).toBeInTheDocument()
    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set up your organization' })).toHaveAttribute('href', '/login/sign-up')
  })

  it('embeds Clerk <SignUp /> on /login/sign-up with the pilot note and a way back', () => {
    renderAt('/login/sign-up')
    expect(screen.getByRole('heading', { name: 'Set up Pretzel for your team' })).toBeInTheDocument()
    expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument()
    expect(screen.getByText(/every feature is free/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('leaves the heading to Clerk on later steps (e.g. the email code)', () => {
    renderAt('/login/factor-one')
    expect(screen.queryByRole('heading', { name: 'Sign in to the console' })).not.toBeInTheDocument()
    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument()
  })

  it('keeps the redirect param across the sign-in / sign-up switch', () => {
    renderAt('/login?redirect=/publish')
    expect(screen.getByRole('link', { name: 'Set up your organization' })).toHaveAttribute('href', '/login/sign-up?redirect=/publish')
    expect(signInProps.mock.calls[0]![0]).toMatchObject({ fallbackRedirectUrl: '/publish' })
  })

  it('ignores off-site redirect targets', () => {
    renderAt('/login?redirect=//evil.example')
    expect(signInProps.mock.calls[0]![0]).toMatchObject({ fallbackRedirectUrl: '/dashboard' })
  })

  it('sends an already signed-in visitor to their destination', () => {
    authState = { isLoaded: true, isSignedIn: true }
    renderAt('/login?redirect=/members')
    expect(mockNavigate).toHaveBeenCalledWith('/members', { replace: true })
  })

  it('shows the example-data proof panel', () => {
    renderAt('/login')
    expect(screen.getByText('48 / 48')).toBeInTheDocument()
    expect(screen.getByText(/Example data/)).toBeInTheDocument()
  })
})
