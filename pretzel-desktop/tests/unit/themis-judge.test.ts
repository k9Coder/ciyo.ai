import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import path from 'node:path'

const {
  mockIsPackaged,
  mockTokenizerFromPretrained,
  mockModelFromPretrained,
  mockReadFile,
} = vi.hoisted(() => ({
  mockIsPackaged: vi.fn(() => false),
  mockTokenizerFromPretrained: vi.fn(),
  mockModelFromPretrained: vi.fn(),
  mockReadFile: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockIsPackaged()
    },
  },
}))

// ThemisLocalJudge's behavior must be deterministic regardless of whether
// this checkout happens to have the real (git-ignored, ~140MB) model files
// staged under resources/models/ — it's legitimately absent in CI and
// present after a local verify-themis.ts run. Mocking the library and the
// vocab_remap.json read lets every test control the load outcome directly
// instead of depending on ambient filesystem state.
vi.mock('@huggingface/transformers', () => ({
  AutoTokenizer: { from_pretrained: mockTokenizerFromPretrained },
  AutoModelForSequenceClassification: { from_pretrained: mockModelFromPretrained },
  Tensor: class {
    type: string
    data: unknown
    dims: unknown
    constructor(type: string, data: unknown, dims: unknown) {
      this.type = type
      this.data = data
      this.dims = dims
    }
  },
  env: { allowLocalModels: false, allowRemoteModels: false, localModelPath: '' },
}))

vi.mock('node:fs/promises', () => ({ readFile: mockReadFile }))

import { resolveModelDir, remapIds, softmax, type VocabRemap } from '../../electron/themis-judge'

describe('resolveModelDir', () => {
  afterEach(() => {
    mockIsPackaged.mockReset()
    mockIsPackaged.mockReturnValue(false)
  })

  it('resolves relative to the project in dev (app.isPackaged = false)', () => {
    mockIsPackaged.mockReturnValue(false)
    const dir = resolveModelDir()
    expect(dir).toBe(path.join(__dirname, '../../resources/models/themis'))
  })

  it('resolves under process.resourcesPath when packaged', () => {
    mockIsPackaged.mockReturnValue(true)
    const originalResourcesPath = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', { value: '/Applications/Pretzel.app/Contents/Resources', configurable: true })
    const dir = resolveModelDir()
    expect(dir).toBe(path.join('/Applications/Pretzel.app/Contents/Resources', 'models', 'themis'))
    Object.defineProperty(process, 'resourcesPath', { value: originalResourcesPath, configurable: true })
  })
})

describe('remapIds', () => {
  it('maps known old ids to their new ids', () => {
    const remap: VocabRemap = { old_to_new: { '5': 2, '100': 7 }, fallback_new_id: 3 }
    const result = remapIds([5n, 100n], remap)
    expect(Array.from(result)).toEqual([2n, 7n])
  })

  it('falls back to fallback_new_id for an id with no mapping', () => {
    const remap: VocabRemap = { old_to_new: { '5': 2 }, fallback_new_id: 3 }
    const result = remapIds([5n, 999999n], remap)
    expect(Array.from(result)).toEqual([2n, 3n])
  })

  it('returns a BigInt64Array', () => {
    const remap: VocabRemap = { old_to_new: { '1': 1 }, fallback_new_id: 0 }
    const result = remapIds([1n], remap)
    expect(result).toBeInstanceOf(BigInt64Array)
  })
})

describe('softmax', () => {
  it('sums to 1', () => {
    const probs = softmax([1, 2, 3])
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })

  it('gives the larger logit the larger probability', () => {
    const probs = softmax([0.1, 5.0])
    expect(probs[1]).toBeGreaterThan(probs[0])
  })

  it('handles equal logits as equal probabilities', () => {
    const probs = softmax([2, 2])
    expect(probs[0]).toBeCloseTo(probs[1], 10)
  })
})

describe('ThemisLocalJudge', () => {
  beforeEach(() => {
    vi.resetModules()
    mockTokenizerFromPretrained.mockReset()
    mockModelFromPretrained.mockReset()
    mockReadFile.mockReset()
  })

  it('does not call AutoTokenizer.from_pretrained merely by being imported and constructed', async () => {
    mockTokenizerFromPretrained.mockImplementation(() => new Promise(() => {}))
    mockModelFromPretrained.mockImplementation(() => new Promise(() => {}))
    const { ThemisLocalJudge } = await import('../../electron/themis-judge')
    new ThemisLocalJudge()
    await Promise.resolve()
    expect(mockTokenizerFromPretrained).not.toHaveBeenCalled()
    expect(mockModelFromPretrained).not.toHaveBeenCalled()
  })

  it('isAvailable() triggers the load in the background without blocking the caller', async () => {
    mockTokenizerFromPretrained.mockImplementation(() => new Promise(() => {}))
    mockModelFromPretrained.mockImplementation(() => new Promise(() => {}))
    const { ThemisLocalJudge } = await import('../../electron/themis-judge')
    const judge = new ThemisLocalJudge()
    expect(judge.isAvailable()).toBe(false)
    await Promise.resolve()
    expect(mockTokenizerFromPretrained).toHaveBeenCalledTimes(1)
  })

  it('isAvailable() is false before the model loads (e.g. files missing in this checkout)', async () => {
    mockTokenizerFromPretrained.mockRejectedValue(new Error('mocked: no model in this test'))
    mockModelFromPretrained.mockRejectedValue(new Error('mocked: no model in this test'))
    const { ThemisLocalJudge } = await import('../../electron/themis-judge')
    const judge = new ThemisLocalJudge()
    expect(judge.isAvailable()).toBe(false)
  })

  it('classify() rejects with a clear error when the model never loaded', async () => {
    mockTokenizerFromPretrained.mockRejectedValue(new Error('mocked: no model in this test'))
    mockModelFromPretrained.mockRejectedValue(new Error('mocked: no model in this test'))
    const { ThemisLocalJudge } = await import('../../electron/themis-judge')
    const judge = new ThemisLocalJudge()
    await expect(judge.classify({ text: 'hello', prompt: 'does this match anything' })).rejects.toBeTruthy()
  })

  it('two concurrent classify() calls both reject consistently, awaiting the same in-flight load instead of starting a second one', async () => {
    mockTokenizerFromPretrained.mockRejectedValue(new Error('mocked: no model in this test'))
    mockModelFromPretrained.mockRejectedValue(new Error('mocked: no model in this test'))
    const { ThemisLocalJudge } = await import('../../electron/themis-judge')
    const judge = new ThemisLocalJudge()
    const [first, second] = await Promise.allSettled([
      judge.classify({ text: 'hello', prompt: 'does this match anything' }),
      judge.classify({ text: 'world', prompt: 'does this match anything else' }),
    ])
    expect(first.status).toBe('rejected')
    expect(second.status).toBe('rejected')
    expect(mockTokenizerFromPretrained).toHaveBeenCalledTimes(1)
    expect(mockModelFromPretrained).toHaveBeenCalledTimes(1)
  })

  it('applies the vocab remap to input_ids before calling the model, and leaves attention_mask untouched', async () => {
    const fakeAttentionMask = { data: new Int32Array([1, 1]), dims: [1, 2] }
    const mockTokenizerCall = vi.fn(() => ({
      input_ids: { data: BigInt64Array.from([10n, 999n]), dims: [1, 2] },
      attention_mask: fakeAttentionMask,
    }))
    mockTokenizerFromPretrained.mockResolvedValue(mockTokenizerCall)
    const mockModelCall = vi.fn().mockResolvedValue({ logits: { data: new Float32Array([0, 1]) } })
    mockModelFromPretrained.mockResolvedValue(mockModelCall)
    mockReadFile.mockResolvedValue(JSON.stringify({ old_to_new: { '10': 1, '999': 2 }, fallback_new_id: 0 }))

    const { ThemisLocalJudge } = await import('../../electron/themis-judge')
    const judge = new ThemisLocalJudge()
    await judge.classify({ text: 'hi', prompt: 'does this match' })

    expect(mockModelCall).toHaveBeenCalledTimes(1)
    const callArg = mockModelCall.mock.calls[0][0] as { input_ids: { data: BigInt64Array }; attention_mask: unknown }
    expect(Array.from(callArg.input_ids.data)).toEqual([1n, 2n])
    expect(callArg.attention_mask).toBe(fakeAttentionMask)
  })

  it('returns verdict=match with the match-label probability as confidence when the model favors match', async () => {
    mockTokenizerFromPretrained.mockResolvedValue(
      vi.fn(() => ({ input_ids: { data: BigInt64Array.from([1n]), dims: [1, 1] }, attention_mask: { data: new Int32Array([1]), dims: [1, 1] } })),
    )
    mockModelFromPretrained.mockResolvedValue(vi.fn().mockResolvedValue({ logits: { data: new Float32Array([0, 10]) } }))
    mockReadFile.mockResolvedValue(JSON.stringify({ old_to_new: {}, fallback_new_id: 0 }))

    const { ThemisLocalJudge } = await import('../../electron/themis-judge')
    const judge = new ThemisLocalJudge()
    const verdict = await judge.classify({ text: 'x', prompt: 'y' })

    expect(verdict.verdict).toBe('match')
    expect(verdict.confidence).toBeGreaterThan(0.9)
  })

  it('returns verdict=no_match with 1-matchProb as confidence when the model favors no_match', async () => {
    mockTokenizerFromPretrained.mockResolvedValue(
      vi.fn(() => ({ input_ids: { data: BigInt64Array.from([1n]), dims: [1, 1] }, attention_mask: { data: new Int32Array([1]), dims: [1, 1] } })),
    )
    mockModelFromPretrained.mockResolvedValue(vi.fn().mockResolvedValue({ logits: { data: new Float32Array([10, 0]) } }))
    mockReadFile.mockResolvedValue(JSON.stringify({ old_to_new: {}, fallback_new_id: 0 }))

    const { ThemisLocalJudge } = await import('../../electron/themis-judge')
    const judge = new ThemisLocalJudge()
    const verdict = await judge.classify({ text: 'x', prompt: 'y' })

    expect(verdict.verdict).toBe('no_match')
    expect(verdict.confidence).toBeGreaterThan(0.9)
  })
})
