import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockIsAvailable, mockClassify } = vi.hoisted(() => ({
  mockIsAvailable: vi.fn(() => true),
  mockClassify: vi.fn().mockResolvedValue({ verdict: 'no_match', confidence: 0.1 }),
}))

vi.mock('../../electron/themis-judge', () => ({
  ThemisLocalJudge: vi.fn().mockImplementation(() => ({
    isAvailable: mockIsAvailable,
    classify: mockClassify,
  })),
}))

describe('runLocalJudgePoc', () => {
  const originalEnv = process.env.PRETZEL_LOCAL_JUDGE_POC

  beforeEach(() => {
    vi.resetModules()
    mockIsAvailable.mockReset().mockReturnValue(true)
    mockClassify.mockReset().mockResolvedValue({ verdict: 'no_match', confidence: 0.1 })
  })

  afterEach(() => {
    process.env.PRETZEL_LOCAL_JUDGE_POC = originalEnv
  })

  it('never calls classify() when the flag is off, even if the judge is available', async () => {
    delete process.env.PRETZEL_LOCAL_JUDGE_POC
    const { runLocalJudgePoc } = await import('../../electron/local-judge-poc')
    await runLocalJudgePoc('example.com', 'hello world')
    expect(mockClassify).not.toHaveBeenCalled()
  })

  it('logs a visible skip line and never calls classify() when the flag is on but the judge is not yet available', async () => {
    process.env.PRETZEL_LOCAL_JUDGE_POC = '1'
    mockIsAvailable.mockReturnValue(false)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { runLocalJudgePoc } = await import('../../electron/local-judge-poc')
    await runLocalJudgePoc('example.com', 'hello world')
    expect(mockClassify).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not ready'))
    logSpy.mockRestore()
  })

  it('truncates the body before calling classify(), so a large request does not block on full-length tokenization', async () => {
    process.env.PRETZEL_LOCAL_JUDGE_POC = '1'
    const { runLocalJudgePoc } = await import('../../electron/local-judge-poc')
    const hugeBody = 'x'.repeat(2_000_000)
    await runLocalJudgePoc('example.com', hugeBody)
    expect(mockClassify).toHaveBeenCalled()
    for (const call of mockClassify.mock.calls) {
      const input = call[0] as { text: string }
      expect(input.text.length).toBeLessThan(10_000)
    }
  })
})
