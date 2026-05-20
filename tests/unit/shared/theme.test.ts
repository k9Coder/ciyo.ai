import { describe, it, expect, beforeEach, vi } from 'vitest'

const attr: Record<string, string> = {}
const mockDocumentElement = {
  getAttribute: (name: string) => attr[name] ?? null,
  setAttribute: (name: string, value: string) => { attr[name] = value },
  removeAttribute: (name: string) => { delete attr[name] },
}
vi.stubGlobal('document', { documentElement: mockDocumentElement })

const mockSet = vi.fn()
const mockGet = vi.fn()
vi.stubGlobal('chrome', { storage: { sync: { set: mockSet, get: mockGet } } })

import { getTheme, setTheme, initTheme } from '../../../src/shared/theme'

describe('extension theme', () => {
  beforeEach(() => {
    delete attr['data-theme']
    mockSet.mockReset()
    mockGet.mockReset()
  })

  it('getTheme returns dark by default', () => {
    expect(getTheme()).toBe('dark')
  })

  it('setTheme light sets data-theme attribute', () => {
    setTheme('light')
    expect(attr['data-theme']).toBe('light')
  })

  it('setTheme dark removes data-theme attribute', () => {
    attr['data-theme'] = 'light'
    setTheme('dark')
    expect(attr['data-theme']).toBeUndefined()
  })

  it('setTheme persists to chrome.storage.sync', () => {
    setTheme('light')
    expect(mockSet).toHaveBeenCalledWith({ theme: 'light' })
  })
})
