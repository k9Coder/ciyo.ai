import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.1.4') },
}))

import { compareVersions, checkForUpdate } from '../../electron/version-check'

describe('compareVersions', () => {
  it('detects newer major/minor/patch', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('0.2.0', '0.1.9')).toBeGreaterThan(0)
    expect(compareVersions('0.1.5', '0.1.4')).toBeGreaterThan(0)
  })

  it('detects older and equal', () => {
    expect(compareVersions('0.1.3', '0.1.4')).toBeLessThan(0)
    expect(compareVersions('0.1.4', '0.1.4')).toBe(0)
  })

  it('handles missing/short segments as zero', () => {
    expect(compareVersions('1', '1.0.0')).toBe(0)
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.1', '1.2')).toBeGreaterThan(0)
  })
})

describe('checkForUpdate', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('flags an update when remote is newer', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ latest: '0.2.0' }),
    })
    const r = await checkForUpdate()
    expect(r).toEqual({ current: '0.1.4', latest: '0.2.0', updateAvailable: true })
  })

  it('reports up to date when remote equals current', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ latest: '0.1.4' }),
    })
    const r = await checkForUpdate()
    expect(r.updateAvailable).toBe(false)
    expect(r.latest).toBe('0.1.4')
  })

  it('never flags an update on non-ok response', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({}) })
    const r = await checkForUpdate()
    expect(r).toEqual({ current: '0.1.4', latest: null, updateAvailable: false })
  })

  it('never throws on network failure', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'))
    const r = await checkForUpdate()
    expect(r).toEqual({ current: '0.1.4', latest: null, updateAvailable: false })
  })

  it('ignores a malformed latest field', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ latest: 123 }),
    })
    const r = await checkForUpdate()
    expect(r.updateAvailable).toBe(false)
    expect(r.latest).toBeNull()
  })
})
