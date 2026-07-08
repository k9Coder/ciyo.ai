import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/hooks/useMemberships', () => ({ useMemberships: vi.fn() }))
vi.mock('../src/lib/tenant', () => ({
  getSelectedTenantId: vi.fn(),
  setSelectedTenantId: vi.fn(),
  clearSelectedTenantId: vi.fn(),
}))

import { useMemberships } from '../src/hooks/useMemberships'
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
    vi.mocked(getSelectedTenantId).mockReturnValue('t2')
    vi.mocked(useMemberships).mockReturnValue({ data: TWO, isLoading: false, isError: false } as any)
    render(<TenantBootstrap>{child()}</TenantBootstrap>)
    expect(screen.getByText('app shell')).toBeInTheDocument()
    expect(clearSelectedTenantId).not.toHaveBeenCalled()
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
