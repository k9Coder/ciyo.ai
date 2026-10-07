/**
 * Regression: see service-worker-judge-keepalive.test.ts for the full
 * story. This half of the fix — the offscreen document opening a
 * persistent port back to the service worker on load — is what keeps the
 * service worker alive once the document exists, so later calls (not just
 * the first warm-up attempt) don't race Chrome's idle teardown either.
 */
import { describe, it, expect, vi } from 'vitest'

const mockPort = { disconnect: vi.fn(), onDisconnect: { addListener: vi.fn() } }
const mockConnect = vi.fn().mockReturnValue(mockPort)

vi.mock('../../../src/offscreen/themis-judge', () => ({
  ThemisLocalJudge: vi.fn().mockImplementation(() => ({
    isAvailable: vi.fn().mockReturnValue(false),
    classify: vi.fn(),
  })),
}))

vi.stubGlobal('chrome', {
  runtime: {
    connect:     mockConnect,
    onMessage:   { addListener: vi.fn() },
  },
})

describe('offscreen document keepalive', () => {
  it('opens a persistent port back to the service worker on load', async () => {
    await import('../../../src/offscreen/offscreen')
    expect(mockConnect).toHaveBeenCalledWith({ name: 'local-judge-keepalive' })
  })

  it('never disconnects the keepalive port', () => {
    expect(mockPort.disconnect).not.toHaveBeenCalled()
  })
})
