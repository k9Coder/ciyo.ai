import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RemoteLocalJudge } from '../../../src/background/remote-local-judge'

describe('RemoteLocalJudge', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: {
        getContexts: vi.fn().mockResolvedValue([]),
        sendMessage: vi.fn(),
        ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
      },
      offscreen: {
        createDocument: vi.fn().mockResolvedValue(undefined),
        Reason: { WORKERS: 'WORKERS' },
      },
    })
  })

  it('isAvailable() is false before any readiness ping has resolved', () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ available: true })
    const judge = new RemoteLocalJudge()
    expect(judge.isAvailable()).toBe(false)
  })

  it('isAvailable() kicks off a LOCAL_JUDGE_PING without blocking the caller', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ available: true })
    const judge = new RemoteLocalJudge()
    expect(judge.isAvailable()).toBe(false) // returns immediately, before the ping resolves
    await new Promise((r) => setTimeout(r, 0))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'LOCAL_JUDGE_PING' })
  })

  it('isAvailable() becomes true once the offscreen doc reports ready', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ available: true })
    const judge = new RemoteLocalJudge()
    judge.isAvailable()
    await new Promise((r) => setTimeout(r, 0))
    expect(judge.isAvailable()).toBe(true)
  })

  it('isAvailable() stays false when the offscreen doc reports not ready', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ available: false })
    const judge = new RemoteLocalJudge()
    judge.isAvailable()
    await new Promise((r) => setTimeout(r, 0))
    expect(judge.isAvailable()).toBe(false)
  })

  it('isAvailable() stays false when the ping itself rejects', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('offscreen doc gone'))
    const judge = new RemoteLocalJudge()
    judge.isAvailable()
    await new Promise((r) => setTimeout(r, 0))
    expect(judge.isAvailable()).toBe(false)
  })

  it('classify() lazily creates the offscreen document, then sends the message', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ verdict: 'match', confidence: 0.8 })
    const judge = new RemoteLocalJudge()
    const result = await judge.classify({ text: 'hello', prompt: 'is this a secret?' })
    expect(result).toEqual({ verdict: 'match', confidence: 0.8 })
    expect(chrome.offscreen.createDocument).toHaveBeenCalledOnce()
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'LOCAL_JUDGE_CLASSIFY',
      payload: { prompt: 'is this a secret?', text: 'hello' },
    })
  })

  it('does not re-create the offscreen document on a second classify call', async () => {
    vi.mocked(chrome.runtime.getContexts).mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }] as unknown as Awaited<ReturnType<typeof chrome.runtime.getContexts>>)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ verdict: 'no_match', confidence: 0.1 })
    const judge = new RemoteLocalJudge()
    await judge.classify({ text: 'a', prompt: 'p' })
    await judge.classify({ text: 'b', prompt: 'p' })
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled()
  })

  it('does not re-create the offscreen document when one already exists at construction', async () => {
    vi.mocked(chrome.runtime.getContexts).mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }] as unknown as Awaited<ReturnType<typeof chrome.runtime.getContexts>>)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ verdict: 'no_match', confidence: 0.1 })
    const judge = new RemoteLocalJudge()
    await judge.classify({ text: 'a', prompt: 'p' })
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled()
  })

  it('propagates a sendMessage rejection to the caller (engine-level try/catch handles it)', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('offscreen doc gone'))
    const judge = new RemoteLocalJudge()
    await expect(judge.classify({ text: 'a', prompt: 'p' })).rejects.toThrow('offscreen doc gone')
  })

  it('retries offscreen document creation after a prior attempt failed', async () => {
    vi.mocked(chrome.offscreen.createDocument)
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce(undefined)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ verdict: 'no_match', confidence: 0.1 })
    const judge = new RemoteLocalJudge()
    await expect(judge.classify({ text: 'a', prompt: 'p' })).rejects.toThrow('transient failure')
    await judge.classify({ text: 'b', prompt: 'p' })
    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(2)
  })
})
