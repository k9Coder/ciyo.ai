import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEmit = vi.fn()
vi.mock('../src/events/policy-bus.js', () => ({
  policyBus:          { emit: mockEmit },
  policyUpdatedEvent: (id: string) => `policy:updated:${id}`,
}))

const mockInsertValues = vi.fn().mockResolvedValue(undefined)

// Build a chainable builder that resolves at the end of the chain
function makeSelectBuilder(result: unknown[]) {
  const builder = {
    from:    () => builder,
    where:   () => ({ ...builder, then: (resolve: (v: unknown) => void) => resolve(result) }),
    orderBy: () => builder,
    limit:   () => ({ then: (resolve: (v: unknown) => void) => resolve(result) }),
  }
  return builder
}

const mockSelect = vi.fn()
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues })

vi.mock('../src/db/client.js', () => ({
  db: { select: mockSelect, insert: mockInsert },
}))

describe('publishPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // getVersionOnly: select → from → where → resolves [{ version: 2 }]
    mockSelect.mockReturnValueOnce(makeSelectBuilder([{ version: 2 }]))
  })

  it('emits policy:updated after inserting to DB', async () => {
    const { publishPolicy } = await import('../src/policy/service.js')
    await publishPolicy('tenant-1', { version: 1, tenantId: 'tenant-1', subjects: [], siteConfigs: {} })
    expect(mockEmit).toHaveBeenCalledWith('policy:updated:tenant-1')
  })

  it('returns the correct next version number', async () => {
    const { publishPolicy } = await import('../src/policy/service.js')
    const v = await publishPolicy('tenant-1', { version: 1, tenantId: 'tenant-1', subjects: [], siteConfigs: {} })
    expect(v).toBe(3) // max version is 2, next is 3
  })
})
