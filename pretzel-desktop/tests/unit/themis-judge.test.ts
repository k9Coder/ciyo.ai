import { describe, it, expect, vi, afterEach } from 'vitest'
import path from 'node:path'

const { mockIsPackaged } = vi.hoisted(() => ({ mockIsPackaged: vi.fn(() => false) }))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockIsPackaged()
    },
  },
}))

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
