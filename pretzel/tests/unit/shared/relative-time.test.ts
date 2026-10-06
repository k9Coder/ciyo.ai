import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from '../../../src/shared/relative-time'

const NOW = 1_000_000_000_000
const ago = (ms: number) => formatRelativeTime(NOW - ms, NOW)

describe('formatRelativeTime', () => {
  it('says just now under a minute', () => expect(ago(10_000)).toBe('just now'))
  it('formats minutes', () => {
    expect(ago(60_000)).toBe('1 min ago')
    expect(ago(5 * 60_000)).toBe('5 min ago')
  })
  it('formats hours', () => {
    expect(ago(3_600_000)).toBe('1 hour ago')
    expect(ago(3 * 3_600_000)).toBe('3 hours ago')
  })
  it('formats days', () => expect(ago(2 * 86_400_000)).toBe('2 days ago'))
  it('never goes negative for future timestamps', () => expect(formatRelativeTime(NOW + 5000, NOW)).toBe('just now'))
})
