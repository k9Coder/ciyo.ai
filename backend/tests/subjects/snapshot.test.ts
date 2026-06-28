import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockValues = vi.fn().mockResolvedValue(undefined)
const mockRulesGet = vi.fn()

vi.mock('../../src/db/client.js', () => ({
  db: { select: mockSelect, insert: mockInsert },
}))

vi.mock('../../src/http/internal-client.js', () => ({
  rulesClient: { get: mockRulesGet },
}))

beforeEach(() => vi.resetAllMocks())

const subject = {
  id: 'sub-1', tenantId: 'tenant-1', name: 'PII',
  description: 'Personally identifiable info',
  divisionId: null, teamId: null, active: true, createdAt: new Date(),
}

const rule = {
  id: 'rule-1', tenantId: 'tenant-1', subjectId: 'sub-1',
  kind: 'keyword', keywords: ['password'], pattern: null,
  destinations: [], destinationGroupIds: [], action: 'block',
  message: null, reportLevel: 'none', active: true, createdAt: new Date(),
}

function setupMocks(subjectResult: unknown[], rulesResult: unknown[], maxVersion: number | null) {
  mockSelect
    .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(subjectResult) })
    .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ version: maxVersion }]) })
  mockInsert.mockReturnValue({ values: mockValues })
  mockRulesGet.mockResolvedValueOnce({ data: rulesResult })
}

describe('snapshotSubject', () => {
  it('inserts a version row with the correct snapshot shape', async () => {
    setupMocks([subject], [rule], 3)
    const { snapshotSubject } = await import('../../src/subjects/snapshot.js')
    await snapshotSubject('tenant-1', 'sub-1', 'pre_ai_apply', 'msg-abc')

    const insertArg = mockValues.mock.calls[0][0]
    expect(insertArg.tenantId).toBe('tenant-1')
    expect(insertArg.subjectId).toBe('sub-1')
    expect(insertArg.version).toBe(4)
    expect(insertArg.source).toBe('pre_ai_apply')
    expect(insertArg.conversationMsgId).toBe('msg-abc')
    expect(insertArg.snapshot.name).toBe('PII')
    expect(insertArg.snapshot.rules).toHaveLength(1)
    expect(insertArg.snapshot.rules[0].id).toBe('rule-1')
  })

  it('uses version 1 when no prior versions exist', async () => {
    setupMocks([subject], [], null)
    const { snapshotSubject } = await import('../../src/subjects/snapshot.js')
    await snapshotSubject('tenant-1', 'sub-1', 'pre_ai_apply')
    expect(mockValues.mock.calls[0][0].version).toBe(1)
  })

  it('does nothing when subject does not exist', async () => {
    mockSelect.mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) })
    const { snapshotSubject } = await import('../../src/subjects/snapshot.js')
    await snapshotSubject('tenant-1', 'ghost', 'pre_ai_apply')
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
