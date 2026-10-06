/**
 * Unit tests for tray-icon.ts — verifies each state renders distinct,
 * cached, non-empty image data (mocking Electron's nativeImage since this
 * runs outside a real Electron process).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateFromBuffer } = vi.hoisted(() => ({
  mockCreateFromBuffer: vi.fn((buf: Buffer) => ({
    resize: vi.fn(() => ({ __buf: buf })),
  })),
}))

vi.mock('electron', () => ({
  nativeImage: { createFromBuffer: mockCreateFromBuffer },
}))

import { renderTrayIcon, _resetCacheForTest } from '../../electron/tray-icon'

beforeEach(() => {
  _resetCacheForTest()
  mockCreateFromBuffer.mockClear()
})

describe('renderTrayIcon', () => {
  it('renders a non-empty PNG buffer for each state', () => {
    for (const state of ['active', 'warn', 'inactive'] as const) {
      mockCreateFromBuffer.mockClear()
      renderTrayIcon(state)
      const buf = mockCreateFromBuffer.mock.calls[0]![0] as Buffer
      expect(buf.length).toBeGreaterThan(8)
      expect(Array.from(buf.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    }
  })

  it('produces different pixel data for different states (the status dot color differs)', () => {
    renderTrayIcon('active')
    const activeBuf = mockCreateFromBuffer.mock.calls[0]![0] as Buffer

    renderTrayIcon('inactive')
    const inactiveBuf = mockCreateFromBuffer.mock.calls[1]![0] as Buffer

    expect(activeBuf.equals(inactiveBuf)).toBe(false)
  })

  it('caches — a second call for the same state does not re-render', () => {
    renderTrayIcon('warn')
    expect(mockCreateFromBuffer).toHaveBeenCalledTimes(1)

    renderTrayIcon('warn')
    expect(mockCreateFromBuffer).toHaveBeenCalledTimes(1) // still 1 — cache hit
  })

  it('returns the exact same image reference on cache hit', () => {
    const first = renderTrayIcon('active')
    const second = renderTrayIcon('active')
    expect(first).toBe(second)
  })
})
