import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Action } from '../src/assistant/llm/interface.js'

const mockSelect = vi.fn()
vi.mock('../src/db/client.js', () => ({ db: { select: mockSelect } }))

beforeEach(() => vi.resetAllMocks())

describe('resolveAffectedSubjectIds', () => {
  it('returns subjectId directly for create_rule, update_subject, delete_subject', async () => {
    const { resolveAffectedSubjectIds } = await import('../src/assistant/versioning.js')
    const actions: Action[] = [
      { op: 'create_rule', subjectId: 'sub-a', kind: 'keyword', keywords: ['foo'], action: 'warn' },
      { op: 'update_subject', subjectId: 'sub-b', patch: { name: 'New' } },
      { op: 'delete_subject', subjectId: 'sub-c' },
      { op: 'create_subject', name: 'IP' },
    ]
    const ids = await resolveAffectedSubjectIds('tenant-1', actions)
    expect(ids).toContain('sub-a')
    expect(ids).toContain('sub-b')
    expect(ids).toContain('sub-c')
    expect(ids).not.toContain(undefined)
    expect(ids).not.toContain(null)
  })

  it('looks up subjectId from DB for update_rule and delete_rule', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ subjectId: 'sub-d' }]),
    })
    const { resolveAffectedSubjectIds } = await import('../src/assistant/versioning.js')
    const actions: Action[] = [
      { op: 'update_rule', ruleId: 'rule-1', patch: { action: 'block' } },
      { op: 'delete_rule', ruleId: 'rule-2' },
    ]
    const ids = await resolveAffectedSubjectIds('tenant-1', actions)
    expect(ids).toContain('sub-d')
  })

  it('deduplicates subject ids', async () => {
    const { resolveAffectedSubjectIds } = await import('../src/assistant/versioning.js')
    const actions: Action[] = [
      { op: 'create_rule', subjectId: 'sub-a', kind: 'keyword', action: 'warn' },
      { op: 'update_subject', subjectId: 'sub-a', patch: { name: 'X' } },
    ]
    const ids = await resolveAffectedSubjectIds('tenant-1', actions)
    expect(ids.filter(id => id === 'sub-a')).toHaveLength(1)
  })
})
