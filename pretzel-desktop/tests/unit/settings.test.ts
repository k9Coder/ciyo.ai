/**
 * Unit tests for settings.ts — persistence, defaults, cache invalidation,
 * and graceful fallback on a corrupt/foreign settings.json.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}))

vi.mock('fs', () => ({
  default: { readFileSync: mockReadFileSync, writeFileSync: mockWriteFileSync },
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}))

import { loadSettings, saveSettings, _resetSettingsCacheForTest } from '../../electron/settings'

const DIR = 'C:/fake/userData'

beforeEach(() => {
  vi.clearAllMocks()
  _resetSettingsCacheForTest()
})

describe('loadSettings', () => {
  it('returns defaults when no settings file exists', () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const s = loadSettings(DIR)
    expect(s).toEqual({
      hasSeenWalkthrough: false,
      notifyOnBlock: 'native',
      notifyOnWarn: 'badge',
    })
  })

  it('returns defaults (not a crash) when the file is corrupt JSON', () => {
    mockReadFileSync.mockReturnValue('{not valid json')
    expect(() => loadSettings(DIR)).not.toThrow()
    expect(loadSettings(DIR).notifyOnBlock).toBe('native')
  })

  it('returns defaults when the file has a foreign/invalid shape', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ notifyOnBlock: 'not-a-real-level' }))
    expect(loadSettings(DIR).notifyOnBlock).toBe('native')
  })

  it('loads real saved values', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      hasSeenWalkthrough: true,
      notifyOnBlock: 'off',
      notifyOnWarn: 'native-sound',
    }))
    expect(loadSettings(DIR)).toEqual({
      hasSeenWalkthrough: true,
      notifyOnBlock: 'off',
      notifyOnWarn: 'native-sound',
    })
  })

  it('caches — a second call does not re-read the file', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ hasSeenWalkthrough: true }))
    loadSettings(DIR)
    loadSettings(DIR)
    expect(mockReadFileSync).toHaveBeenCalledTimes(1)
  })

  it('re-reads when the userData dir changes', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({}))
    loadSettings(DIR)
    loadSettings('C:/other/userData')
    expect(mockReadFileSync).toHaveBeenCalledTimes(2)
  })
})

describe('saveSettings', () => {
  it('merges a partial patch onto existing settings and persists it', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ notifyOnBlock: 'native' }))
    const result = saveSettings(DIR, { hasSeenWalkthrough: true })

    expect(result).toEqual({
      hasSeenWalkthrough: true,
      notifyOnBlock: 'native',
      notifyOnWarn: 'badge',
    })
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string)
    expect(written).toEqual(result)
  })

  it('updates the cache so a subsequent loadSettings reflects the save without re-reading', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({}))
    saveSettings(DIR, { notifyOnWarn: 'off' })
    mockReadFileSync.mockClear()

    expect(loadSettings(DIR).notifyOnWarn).toBe('off')
    expect(mockReadFileSync).not.toHaveBeenCalled()
  })
})
