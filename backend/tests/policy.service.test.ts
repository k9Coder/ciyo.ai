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
    // Re-establish mock return values on every test to avoid call-count accumulation
    // across test runs (vi.clearAllMocks resets counts but not implementations)
    mockSelect.mockReturnValue(makeSelectBuilder([{ version: 2 }]))
    mockInsert.mockReturnValue({ values: mockInsertValues })
    mockInsertValues.mockResolvedValue(undefined)
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

  it('calls db.insert with the correct row shape (tenantId, version, policyJson)', async () => {
    const { publishPolicy } = await import('../src/policy/service.js')
    const policyJson = { version: 1 as const, tenantId: 'tenant-1', subjects: [], siteConfigs: {} }
    await publishPolicy('tenant-1', policyJson)

    // Verify insert was actually called
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockInsertValues).toHaveBeenCalledTimes(1)

    // Assert the exact row shape — this is the critical check that was missing
    const insertedRow = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>
    expect(insertedRow.tenantId).toBe('tenant-1')
    expect(insertedRow.version).toBe(3) // max is 2, so next version is 3
    expect(insertedRow.policyJson).toEqual(policyJson)
  })

  it('does not emit event when insert fails', async () => {
    mockInsertValues.mockRejectedValueOnce(new Error('DB write failed'))
    const { publishPolicy } = await import('../src/policy/service.js')
    await expect(
      publishPolicy('tenant-1', { version: 1, tenantId: 'tenant-1', subjects: [], siteConfigs: {} })
    ).rejects.toThrow('DB write failed')
    expect(mockEmit).not.toHaveBeenCalled()
  })
})

describe('publishInitialPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockReturnValue({ values: mockInsertValues })
    mockInsertValues.mockResolvedValue(undefined)
  })

  it('publishes an empty v1 for a tenant with no existing policy', async () => {
    mockSelect.mockReturnValue(makeSelectBuilder([{ version: null }])) // getVersionOnly → null
    const { publishInitialPolicy } = await import('../src/policy/service.js')
    const v = await publishInitialPolicy('tenant-new')
    expect(v).toBe(1)
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const row = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>
    expect(row.tenantId).toBe('tenant-new')
    expect(row.version).toBe(1)
    expect(row.policyJson).toEqual({ version: 1, tenantId: 'tenant-new', subjects: [], siteConfigs: {}, failMode: 'open' })
    expect(mockEmit).toHaveBeenCalledWith('policy:updated:tenant-new')
  })

  it('honors an explicit failMode', async () => {
    mockSelect.mockReturnValue(makeSelectBuilder([{ version: null }]))
    const { publishInitialPolicy } = await import('../src/policy/service.js')
    await publishInitialPolicy('tenant-new', 'closed')
    const row = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>
    expect((row.policyJson as Record<string, unknown>).failMode).toBe('closed')
  })

  it('is a no-op when the tenant already has a published policy', async () => {
    mockSelect.mockReturnValue(makeSelectBuilder([{ version: 2 }])) // getVersionOnly → 2
    const { publishInitialPolicy } = await import('../src/policy/service.js')
    const v = await publishInitialPolicy('tenant-existing')
    expect(v).toBeNull()
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalled()
  })
})
