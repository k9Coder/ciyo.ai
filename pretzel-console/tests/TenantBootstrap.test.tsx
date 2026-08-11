import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/hooks/useMemberships', () => ({ useMemberships: vi.fn() }))
vi.mock('../src/hooks/useTenant', () => ({ useTenant: vi.fn() }))
vi.mock('../src/lib/tenant', () => ({
  getSelectedTenantId: vi.fn(),
  setSelectedTenantId: vi.fn(),
  clearSelectedTenantId: vi.fn(),
}))
vi.mock('react-router-dom', () => ({ Navigate: ({ to }: { to: string }) => <div data-testid={`redirect:${to}`} /> }))

import { useMemberships } from '../src/hooks/useMemberships'
import { useTenant } from '../src/hooks/useTenant'
import {
  getSelectedTenantId, setSelectedTenantId, clearSelectedTenantId,
} from '../src/lib/tenant'
import { TenantBootstrap } from '../src/components/layout/TenantBootstrap'

const assign = vi.fn()
Object.defineProperty(window, 'location', {
  value: { assign }, writable: true,
})

const TWO = [
  { tenantId: 't1', tenantName: 'Acme', role: 'super_admin' },
  { tenantId: 't2', tenantName: 'Globex', role: 'member' },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSelectedTenantId).mockReturnValue(null)
  // Default: wizard already completed, so pre-existing tests below (which don't
  // care about onboarding state) never trip the new redirect branch.
  vi.mocked(useTenant).mockReturnValue({ data: { onboardingWizardCompleted: true }, isLoading: false, isError: false } as any)
})

function child() {
  return <div>app shell</div>
}

describe('TenantBootstrap', () => {
  it('renders the org picker for >1 membership with no selection', () => {
    vi.mocked(useMemberships).mockReturnValue({ data: TWO, isLoading: false, isError: false } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    expect(screen.getByText('Choose an organization')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('Globex')).toBeInTheDocument()
    expect(screen.queryByText('app shell')).not.toBeInTheDocument()
  })

  it('selecting an org persists it and navigates to /dashboard', () => {
    vi.mocked(useMemberships).mockReturnValue({ data: TWO, isLoading: false, isError: false } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    fireEvent.click(screen.getByText('Globex'))
    expect(setSelectedTenantId).toHaveBeenCalledWith('t2')
    expect(assign).toHaveBeenCalledWith('/dashboard')
  })

  it('auto-selects and proceeds when there is exactly 1 membership', () => {
    vi.mocked(useMemberships).mockReturnValue({
      data: [{ tenantId: 'solo', tenantName: 'Only', role: 'super_admin' }],
      isLoading: false, isError: false,
    } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    expect(setSelectedTenantId).toHaveBeenCalledWith('solo')
    expect(screen.getByText('app shell')).toBeInTheDocument()
  })

  it('proceeds without a picker when the persisted selection is valid', () => {
    // t1 = Acme (super_admin). The persisted selection must resolve to an admin
    // membership to reach the app shell — a valid-but-member selection is
    // redirected to /unauthorized (covered separately below).
    vi.mocked(getSelectedTenantId).mockReturnValue('t1')
    vi.mocked(useMemberships).mockReturnValue({ data: TWO, isLoading: false, isError: false } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    expect(screen.getByText('app shell')).toBeInTheDocument()
    expect(clearSelectedTenantId).not.toHaveBeenCalled()
  })

  it('redirects to /unauthorized when the valid persisted selection is a non-admin membership', () => {
    // t2 = Globex (member). Valid selection, but the console is admin-only.
    vi.mocked(getSelectedTenantId).mockReturnValue('t2')
    vi.mocked(useMemberships).mockReturnValue({ data: TWO, isLoading: false, isError: false } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    expect(screen.getByTestId('redirect:/unauthorized')).toBeInTheDocument()
    expect(screen.queryByText('app shell')).not.toBeInTheDocument()
  })

  it('clears an invalid persisted selection and shows the picker', () => {
    vi.mocked(getSelectedTenantId).mockReturnValue('stale')
    vi.mocked(useMemberships).mockReturnValue({ data: TWO, isLoading: false, isError: false } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    expect(clearSelectedTenantId).toHaveBeenCalled()
    expect(screen.getByText('Choose an organization')).toBeInTheDocument()
  })

  it('proceeds (no picker) when the user is enrolled nowhere', () => {
    vi.mocked(useMemberships).mockReturnValue({ data: [], isLoading: false, isError: false } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    expect(screen.getByText('app shell')).toBeInTheDocument()
    expect(setSelectedTenantId).not.toHaveBeenCalled()
  })
})

describe('TenantBootstrap — onboarding wizard redirect', () => {
  const SOLO_SUPER_ADMIN = [{ tenantId: 't1', tenantName: 'Acme', role: 'super_admin' }]
  const SOLO_MEMBER = [{ tenantId: 't1', tenantName: 'Acme', role: 'member' }]

  it('redirects to /onboarding/profile when the sole super_admin has an incomplete wizard', () => {
    vi.mocked(useMemberships).mockReturnValue({ data: SOLO_SUPER_ADMIN, isLoading: false, isError: false } as any)
    vi.mocked(useTenant).mockReturnValue({ data: { onboardingWizardCompleted: false }, isLoading: false, isError: false } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    expect(screen.getByTestId('redirect:/onboarding/profile')).toBeInTheDocument()
  })

  it('renders children when the sole super_admin has a completed wizard', () => {
    vi.mocked(useMemberships).mockReturnValue({ data: SOLO_SUPER_ADMIN, isLoading: false, isError: false } as any)
    vi.mocked(useTenant).mockReturnValue({ data: { onboardingWizardCompleted: true }, isLoading: false, isError: false } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    expect(screen.getByText('app shell')).toBeInTheDocument()
  })

  it('shows a loader, not the app shell, while the tenant completeness check is in flight', () => {
    vi.mocked(useMemberships).mockReturnValue({ data: SOLO_SUPER_ADMIN, isLoading: false, isError: false } as any)
    vi.mocked(useTenant).mockReturnValue({ data: undefined, isLoading: true, isError: false } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    expect(screen.queryByText('app shell')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('fails open into the app shell when the tenant fetch errors', () => {
    vi.mocked(useMemberships).mockReturnValue({ data: SOLO_SUPER_ADMIN, isLoading: false, isError: false } as any)
    vi.mocked(useTenant).mockReturnValue({ data: undefined, isLoading: false, isError: true } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    expect(screen.getByText('app shell')).toBeInTheDocument()
  })

  it('redirects a non-admin sole membership to /unauthorized without gating on tenant completeness', () => {
    vi.mocked(useMemberships).mockReturnValue({ data: SOLO_MEMBER, isLoading: false, isError: false } as any)
    vi.mocked(useTenant).mockReturnValue({ data: undefined, isLoading: false, isError: false } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    expect(screen.getByTestId('redirect:/unauthorized')).toBeInTheDocument()
    expect(screen.queryByText('app shell')).not.toBeInTheDocument()
    // The tenant/onboarding query stays disabled for a non-admin (never a 403).
    expect(vi.mocked(useTenant).mock.calls[0]![0]).toBe(false)
  })
})
