import { describe, it, expect, beforeEach } from 'vitest'
import { getTheme, setTheme, initTheme } from '../src/utils/theme'

describe('admin theme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
  })

  it('getTheme returns dark by default', () => {
    expect(getTheme()).toBe('dark')
  })

  it('setTheme light sets attribute and persists', () => {
    setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('ciyo-theme')).toBe('light')
  })

  it('setTheme dark removes attribute and persists', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
    expect(localStorage.getItem('ciyo-theme')).toBe('dark')
  })

  it('initTheme restores light from localStorage', () => {
    localStorage.setItem('ciyo-theme', 'light')
    initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
