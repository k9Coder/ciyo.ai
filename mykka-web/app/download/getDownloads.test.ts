import { beforeEach, describe, expect, it, vi } from 'vitest'
import { list } from '@vercel/blob'
import { getDownloads } from './getDownloads'

vi.mock('@vercel/blob', () => ({ list: vi.fn() }))

const mockList = vi.mocked(list)

beforeEach(() => {
  mockList.mockReset()
})

describe('getDownloads', () => {
  it('separates arm64 and intel dmg builds instead of matching both to the same asset', async () => {
    mockList.mockResolvedValue({
      blobs: [
        { pathname: 'pretzel-desktop/Pretzel-1.2.3-arm64.dmg', url: 'https://blob/arm64.dmg', size: 100 },
        { pathname: 'pretzel-desktop/Pretzel-1.2.3.dmg', url: 'https://blob/intel.dmg', size: 200 },
      ],
    } as never)

    const downloads = await getDownloads()

    expect(downloads.macArm?.url).toBe('https://blob/arm64.dmg')
    expect(downloads.macIntel?.url).toBe('https://blob/intel.dmg')
  })

  it('extracts the version from any matching blob pathname', async () => {
    mockList.mockResolvedValue({
      blobs: [{ pathname: 'pretzel-desktop/Pretzel-2.0.1.exe', url: 'https://blob/win.exe', size: 50 }],
    } as never)

    const downloads = await getDownloads()

    expect(downloads.version).toBe('2.0.1')
    expect(downloads.windows?.url).toBe('https://blob/win.exe')
    expect(downloads.linux).toBeNull()
  })

  it('returns all-null downloads instead of throwing when the blob store is unreachable', async () => {
    mockList.mockRejectedValue(new Error('network error'))

    const downloads = await getDownloads()

    expect(downloads).toEqual({
      version: null,
      macArm: null,
      macIntel: null,
      windows: null,
      linux: null,
    })
  })
})
