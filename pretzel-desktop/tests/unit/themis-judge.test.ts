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

import { resolveModelDir } from '../../electron/themis-judge'

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
