/**
 * Tests for getAuditDB() promise-singleton pattern.
 *
 * The key invariant: no matter how many concurrent callers await getAuditDB()
 * before the first resolves, openDB() is called exactly once and all callers
 * receive the same DB instance.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock constants ───────────────────────────────────────────────────────────

vi.mock('@/shared/constants', () => ({
  AUDIT_DB_NAME:    'mykka-audit',
  AUDIT_DB_VERSION: 1,
  AUDIT_STORE_NAME: 'events',
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDBStub(name = 'fake-db') {
  return {
    name,
    objectStoreNames: { contains: vi.fn().mockReturnValue(false) },
    createObjectStore: vi.fn().mockReturnValue({ createIndex: vi.fn() }),
  }
}

beforeEach(() => {
  vi.resetModules()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getAuditDB singleton', () => {
  it('calls openDB exactly once when two callers race before resolution', async () => {
    let resolveOpen: (db: unknown) => void = () => {}
    const openDBMock = vi.fn(() => new Promise(r => { resolveOpen = r }))

    vi.doMock('idb', () => ({ openDB: openDBMock }))
    const { getAuditDB } = await import('@/audit/db')

    const fakeDB = makeDBStub('race-db')

    // Start two concurrent awaits before either resolves
    const p1 = getAuditDB()
    const p2 = getAuditDB()

    // openDB must have been called exactly once synchronously
    expect(openDBMock).toHaveBeenCalledTimes(1)

    // Now resolve the underlying openDB call
    resolveOpen(fakeDB)

    const [db1, db2] = await Promise.all([p1, p2])

    // Both callers received the same instance
    expect(db1).toBe(fakeDB)
    expect(db2).toBe(fakeDB)

    // Still only called once
    expect(openDBMock).toHaveBeenCalledTimes(1)
  })

  it('returns the same DB instance on repeated sequential calls', async () => {
    const fakeDB = makeDBStub('resolved-db')
    const openDBMock = vi.fn().mockResolvedValue(fakeDB)

    vi.doMock('idb', () => ({ openDB: openDBMock }))
    const { getAuditDB } = await import('@/audit/db')

    const db1 = await getAuditDB()
    const db2 = await getAuditDB()
    const db3 = await getAuditDB()

    expect(openDBMock).toHaveBeenCalledTimes(1)
    expect(db1).toBe(fakeDB)
    expect(db2).toBe(fakeDB)
    expect(db3).toBe(fakeDB)
  })

  it('passes oldVersion to upgrade handler for migration branching', async () => {
    let capturedUpgrade: ((db: unknown, oldVersion: number) => void) | undefined

    const openDBMock = vi.fn((_name: string, _ver: number, opts: { upgrade: (db: unknown, oldVersion: number) => void }) => {
      capturedUpgrade = opts.upgrade
      return Promise.resolve({ name: 'db' })
    })

    vi.doMock('idb', () => ({ openDB: openDBMock }))
    const { getAuditDB } = await import('@/audit/db')

    await getAuditDB()

    expect(capturedUpgrade).toBeDefined()

    // Simulate fresh install (oldVersion 0 → 1)
    const dbStub = makeDBStub('upgrade-db')
    capturedUpgrade!(dbStub, 0)

    expect(dbStub.createObjectStore).toHaveBeenCalledWith('events', { keyPath: 'id' })
  })
})
