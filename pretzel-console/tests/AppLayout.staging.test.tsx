import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@clerk/react', () => ({
  useUser: vi.fn(() => ({ user: null })),
  UserButton: () => null,
}))
vi.mock('../src/hooks/usePolicyRealtime', () => ({ usePolicyRealtime: vi.fn() }))
vi.mock('../src/hooks/useTenant', () => ({ useTenant: vi.fn(() => ({ data: undefined })) }))
vi.mock('../src/hooks/useMemberships', () => ({
  useMemberships: vi.fn(() => ({ data: undefined })),
  useActiveOrg: vi.fn(() => undefined),
}))
vi.mock('../src/components/billing/UpgradeBanner', () => ({
  UpgradeBanner: () => null,
  PilotBanner: () => null,
  PlanBadge: () => null,
}))
vi.mock('../src/components/layout/EnforcementBanner', () => ({
  EnforcementBanner: () => null,
}))

import { AppLayout } from '../src/components/layout/AppLayout'

afterEach(() => { vi.unstubAllEnvs() })

describe('AppLayout staging badge', () => {
  it('shows STAGING badge when VITE_APP_ENV is staging', () => {
    vi.stubEnv('VITE_APP_ENV', 'staging')
    render(<MemoryRouter><AppLayout /></MemoryRouter>)
    expect(screen.getByText('STAGING')).toBeInTheDocument()
  })

  it('hides STAGING badge when VITE_APP_ENV is not set', () => {
    vi.stubEnv('VITE_APP_ENV', '')
    render(<MemoryRouter><AppLayout /></MemoryRouter>)
    expect(screen.queryByText('STAGING')).not.toBeInTheDocument()
  })
})
