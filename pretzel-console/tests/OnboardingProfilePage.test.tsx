import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'

vi.mock('../src/hooks/useWireAuthToken', () => ({ useWireAuthToken: vi.fn() }))
vi.mock('../src/api', () => ({
  api: {
    onboarding: { applyTemplate: vi.fn(), skip: vi.fn() },
    tenant: { get: vi.fn() },
  },
}))

import { api } from '../src/api'
import { useTenant } from '../src/hooks/useTenant'
import { OnboardingProfilePage } from '../src/pages/OnboardingProfilePage'

// Stands in for TenantBootstrap's wizard gate: same useTenant() hook (and so
// the same refetchOnMount: false), bouncing back while the wizard isn't done.
function DashboardGate() {
  const { data } = useTenant()
  if (!data) return null
  if (!data.onboardingWizardCompleted) return <Navigate to="/onboarding/profile" replace />
  return <div>Dashboard</div>
}

// The real flow: TenantBootstrap fetched the tenant (wizard not done) and then
// redirected to /onboarding/profile, unmounting itself — so ['tenant'] sits in
// the cache with no observers while the wizard runs.
async function renderFromRedirect() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Fetch through the real queryFn (as useTenant did) so the cached query can
  // be refetched later; first response is the pre-wizard tenant.
  vi.mocked(api.tenant.get).mockResolvedValueOnce({ onboardingWizardCompleted: false } as any)
  await qc.fetchQuery({ queryKey: ['tenant'], queryFn: api.tenant.get })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/onboarding/profile']}>
        <Routes>
          <Route path="/onboarding/profile" element={<OnboardingProfilePage />} />
          <Route path="/dashboard" element={<DashboardGate />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.onboarding.applyTemplate).mockResolvedValue(undefined as any)
  vi.mocked(api.onboarding.skip).mockResolvedValue(undefined as any)
  vi.mocked(api.tenant.get).mockResolvedValue({ onboardingWizardCompleted: true } as any)
})

describe('OnboardingProfilePage', () => {
  it('lands on the dashboard after applying a template instead of bouncing back to onboarding', async () => {
    await renderFromRedirect()
    fireEvent.click(screen.getByText('Accountant / Finance'))
    fireEvent.click(screen.getByText('Internal bookkeeping only'))
    fireEvent.click(screen.getByText('Use this policy →'))

    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(api.onboarding.applyTemplate).toHaveBeenCalledWith('accountant', 'internal_only')
  })

  it('lands on the dashboard after skipping', async () => {
    await renderFromRedirect()
    fireEvent.click(screen.getByText('Other'))
    fireEvent.click(screen.getByText('Go to dashboard →'))

    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(api.onboarding.skip).toHaveBeenCalled()
  })
})
