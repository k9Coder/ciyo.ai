import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user_123', firstName: 'Bob', fullName: 'Bob Builder' }
let mockActiveOrg: { tenantId: string; tenantName: string; role: string } | undefined = {
  tenantId: 'tenant_abc',
  tenantName: 'Acme Corp',
  role: 'super_admin',
}

vi.mock('@clerk/react', () => ({
  useUser: () => ({ user: mockUser }),
}))

vi.mock('../src/hooks/useMemberships', () => ({
  useActiveOrg: () => mockActiveOrg,
}))

import { FirstTimeWelcomeBanner } from '../src/components/layout/FirstTimeWelcomeBanner'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockActiveOrg = {
    tenantId: 'tenant_abc',
    tenantName: 'Acme Corp',
    role: 'super_admin',
  }
})

describe('FirstTimeWelcomeBanner', () => {
  it('renders welcome banner for first-time super_admin', () => {
    render(<FirstTimeWelcomeBanner />)
    expect(screen.getByText(/Welcome to Acme Corp, Bob!/i)).toBeInTheDocument()
    expect(screen.getByText(/you can now sign in to the Pretzel extension/i)).toBeInTheDocument()
  })

  it('renders welcome banner for first-time division_admin', () => {
    mockActiveOrg = { tenantId: 'tenant_abc', tenantName: 'Acme Corp', role: 'division_admin' }
    render(<FirstTimeWelcomeBanner />)
    expect(screen.getByText(/Welcome to Acme Corp, Bob!/i)).toBeInTheDocument()
  })

  it('does NOT render for regular members', () => {
    mockActiveOrg = { tenantId: 'tenant_abc', tenantName: 'Acme Corp', role: 'member' }
    const { container } = render(<FirstTimeWelcomeBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('does NOT render if previously dismissed', () => {
    localStorage.setItem('pretzel_welcome_seen_user_123_tenant_abc', 'true')
    const { container } = render(<FirstTimeWelcomeBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('dismisses and records in localStorage when Got it is clicked', () => {
    render(<FirstTimeWelcomeBanner />)
    const gotItBtn = screen.getByRole('button', { name: /Got it/i })
    fireEvent.click(gotItBtn)
    expect(localStorage.getItem('pretzel_welcome_seen_user_123_tenant_abc')).toBe('true')
    expect(screen.queryByText(/Welcome to Acme Corp, Bob!/i)).not.toBeInTheDocument()
  })
})
