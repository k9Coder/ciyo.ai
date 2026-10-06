import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { PolicyDraft } from '../src/types'

const mutate = vi.fn()
const state = vi.hoisted(() => ({
  policy: { data: { version: 12, tenantName: 'Acme', plan: 'pilot' }, isLoading: false } as any,
  draft:  { data: undefined } as any,
}))

vi.mock('@clerk/react', () => ({
  useUser: vi.fn(() => ({ user: null })),
  UserButton: () => null,
}))
vi.mock('../src/hooks/usePolicy', () => ({
  usePolicy: () => state.policy,
  usePolicyDraft: () => state.draft,
  usePolicyHistory: () => ({ data: [], isLoading: false }),
  usePolicyMutations: () => ({
    publish:  { mutate, isPending: false },
    rollback: { mutateAsync: vi.fn(), isPending: false },
  }),
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
vi.mock('../src/components/layout/EnforcementBanner', () => ({ EnforcementBanner: () => null }))

import { AppLayout } from '../src/components/layout/AppLayout'
import { PublishPage } from '../src/pages/PublishPage'

const DRAFT: PolicyDraft = {
  liveVersion: 12,
  nextVersion: 13,
  count: 2,
  changes: [
    { kind: 'added',   entity: 'rule',    id: 'r1', title: 'IBAN', detail: 'Block in Payments' },
    { kind: 'changed', entity: 'subject', id: 's1', title: 'Payments', detail: 'scope changed' },
  ],
}

beforeEach(() => {
  mutate.mockClear()
  state.policy = { data: { version: 12, tenantName: 'Acme', plan: 'pilot' }, isLoading: false }
  state.draft = { data: undefined }
})

describe('sidebar publish status', () => {
  it('shows the live card when there are no unpublished changes', () => {
    state.draft = { data: { ...DRAFT, count: 0, changes: [] } }
    render(<MemoryRouter><AppLayout /></MemoryRouter>)
    expect(screen.getByText(/Policy v12 is live everywhere/)).toBeInTheDocument()
    expect(screen.queryByText(/not live/)).not.toBeInTheDocument()
  })

  it('shows the not-live card with the count and a publish link', () => {
    state.draft = { data: DRAFT }
    render(<MemoryRouter><AppLayout /></MemoryRouter>)
    expect(screen.getByText('2 changes not live')).toBeInTheDocument()
    expect(screen.getByText(/People still get policy v12 until you publish/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /review & publish/i })).toHaveAttribute('href', '/publish')
  })

  it('uses the singular for one change', () => {
    state.draft = { data: { ...DRAFT, count: 1, changes: DRAFT.changes.slice(0, 1) } }
    render(<MemoryRouter><AppLayout /></MemoryRouter>)
    expect(screen.getByText('1 change not live')).toBeInTheDocument()
  })

  it('falls back to the live card while the draft is loading', () => {
    render(<MemoryRouter><AppLayout /></MemoryRouter>)
    expect(screen.getByText(/Policy v12 is live everywhere/)).toBeInTheDocument()
  })
})

describe('PublishPage draft', () => {
  it('lists the unpublished changes and publishes the next version', () => {
    state.draft = { data: DRAFT }
    render(<MemoryRouter><PublishPage /></MemoryRouter>)
    expect(screen.getByText('2 changes not live')).toBeInTheDocument()
    expect(screen.getByText('IBAN')).toBeInTheDocument()
    expect(screen.getByText('Block in Payments')).toBeInTheDocument()
    expect(screen.getByText('Added')).toBeInTheDocument()
    expect(screen.getByText('Changed')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Publish v13' }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('has no publish button when nothing changed', () => {
    state.draft = { data: { ...DRAFT, count: 0, changes: [] } }
    render(<MemoryRouter><PublishPage /></MemoryRouter>)
    expect(screen.getByText(/No unpublished changes/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Publish/ })).not.toBeInTheDocument()
  })

  it('offers the first publish when nothing has ever been published', () => {
    state.policy = { data: undefined, isLoading: false }
    state.draft = { data: { liveVersion: null, nextVersion: 1, count: 0, changes: [] } }
    render(<MemoryRouter><PublishPage /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Publish v1' })).toBeInTheDocument()
  })
})
