import { describe, it, expect, beforeEach } from 'vitest'
import { recordActivity, getRecentActivity, setActivityOutcome, _resetActivityForTest } from '../../electron/activity-log'

beforeEach(() => _resetActivityForTest())

function entry(hostname: string, timestamp = Date.now()): Parameters<typeof recordActivity>[0] {
  return { hostname, ruleName: 'AWS Key', severity: 'critical', action: 'block', timestamp }
}

describe('activity-log', () => {
  it('starts empty', () => {
    expect(getRecentActivity()).toEqual([])
  })

  it('records an entry', () => {
    recordActivity(entry('chatgpt.com'))
    expect(getRecentActivity()).toHaveLength(1)
    expect(getRecentActivity()[0]!.hostname).toBe('chatgpt.com')
  })

  it('newest entry first', () => {
    recordActivity(entry('chatgpt.com', 1000))
    recordActivity(entry('claude.ai', 2000))
    expect(getRecentActivity().map(e => e.hostname)).toEqual(['claude.ai', 'chatgpt.com'])
  })

  it('caps at 20 entries, dropping the oldest', () => {
    for (let i = 0; i < 25; i++) recordActivity(entry(`site-${i}.com`, i))
    const recent = getRecentActivity()
    expect(recent).toHaveLength(20)
    expect(recent[0]!.hostname).toBe('site-24.com') // newest
    expect(recent[19]!.hostname).toBe('site-5.com')  // oldest kept
  })

  it('fills in the outcome for every finding of one held request, and only that request', () => {
    recordActivity({ ...entry('chatgpt.com'), requestId: 'req-1' })
    recordActivity({ ...entry('chatgpt.com'), requestId: 'req-1' })
    recordActivity({ ...entry('claude.ai'), requestId: 'req-2' })

    setActivityOutcome('req-1', 'timeout-blocked')

    const byRequest = (id: string) => getRecentActivity().filter(e => e.requestId === id)
    expect(byRequest('req-1').map(e => e.outcome)).toEqual(['timeout-blocked', 'timeout-blocked'])
    expect(byRequest('req-2')[0]!.outcome).toBeUndefined()
  })
})
