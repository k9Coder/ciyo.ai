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

  it('isAvailable() is false before any classify call has succeeded', () => {
    const judge = new RemoteLocalJudge()
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

  it('isAvailable() becomes true after a successful classify call', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ verdict: 'no_match', confidence: 0.1 })
    const judge = new RemoteLocalJudge()
    await judge.classify({ text: 'hello', prompt: 'is this a secret?' })
    expect(judge.isAvailable()).toBe(true)
  })

  it('does not re-create the offscreen document on a second classify call', async () => {
    vi.mocked(chrome.runtime.getContexts).mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }] as unknown[])
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ verdict: 'no_match', confidence: 0.1 })
    const judge = new RemoteLocalJudge()
    await judge.classify({ text: 'a', prompt: 'p' })
    await judge.classify({ text: 'b', prompt: 'p' })
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled()
  })

  it('propagates a sendMessage rejection to the caller (engine-level try/catch handles it)', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('offscreen doc gone'))
    const judge = new RemoteLocalJudge()
    await expect(judge.classify({ text: 'a', prompt: 'p' })).rejects.toThrow('offscreen doc gone')
  })
})
