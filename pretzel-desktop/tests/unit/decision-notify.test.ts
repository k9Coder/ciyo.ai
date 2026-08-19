/**
 * Unit tests for decision-notify.ts — verifies each NotifyLevel produces
 * the right (or no) OS notification.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockNotificationCtor, mockShow, mockIsSupported } = vi.hoisted(() => ({
  mockNotificationCtor: vi.fn(),
  mockShow: vi.fn(),
  mockIsSupported: vi.fn(() => true),
}))

vi.mock('electron', () => ({
  Notification: Object.assign(
    vi.fn((opts: object) => { mockNotificationCtor(opts); return { show: mockShow } }),
    { isSupported: mockIsSupported },
  ),
}))

import { notifyDecision } from '../../electron/decision-notify'

const blockEvent = {
  hostname: 'chatgpt.com',
  result: {
    highestAction: 'block' as const,
    findings: [{ ruleId: 'aws-key', ruleName: 'AWS Access Key', severity: 'critical' as const }],
  },
}
const warnEvent = {
  hostname: 'claude.ai',
  result: {
    highestAction: 'warn' as const,
    findings: [{ ruleId: 'pii', ruleName: 'PII Pattern', severity: 'medium' as const }],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsSupported.mockReturnValue(true)
})

describe('notifyDecision', () => {
  it('does nothing for level "off"', () => {
    notifyDecision('off', blockEvent as never)
    expect(mockNotificationCtor).not.toHaveBeenCalled()
  })

  it('does nothing for level "badge" — the decision window is the only cue', () => {
    notifyDecision('badge', blockEvent as never)
    expect(mockNotificationCtor).not.toHaveBeenCalled()
  })

  it('fires a silent notification for level "native"', () => {
    notifyDecision('native', blockEvent as never)
    expect(mockNotificationCtor).toHaveBeenCalledWith(expect.objectContaining({ silent: true }))
    expect(mockShow).toHaveBeenCalled()
  })

  it('fires a non-silent notification for level "native-sound"', () => {
    notifyDecision('native-sound', blockEvent as never)
    expect(mockNotificationCtor).toHaveBeenCalledWith(expect.objectContaining({ silent: false }))
  })

  it('block events get critical urgency and a "blocked" title', () => {
    notifyDecision('native', blockEvent as never)
    const opts = mockNotificationCtor.mock.calls[0]![0] as { title: string; urgency: string }
    expect(opts.urgency).toBe('critical')
    expect(opts.title).toContain('blocked')
    expect(opts.title).toContain('chatgpt.com')
  })

  it('warn events get normal urgency and a "flagged" title', () => {
    notifyDecision('native', warnEvent as never)
    const opts = mockNotificationCtor.mock.calls[0]![0] as { title: string; urgency: string }
    expect(opts.urgency).toBe('normal')
    expect(opts.title).toContain('flagged')
  })

  it('includes the matched rule name in the body', () => {
    notifyDecision('native', blockEvent as never)
    const opts = mockNotificationCtor.mock.calls[0]![0] as { body: string }
    expect(opts.body).toContain('AWS Access Key')
  })

  it('does nothing when Notification is unsupported on this platform', () => {
    mockIsSupported.mockReturnValue(false)
    notifyDecision('native-sound', blockEvent as never)
    expect(mockNotificationCtor).not.toHaveBeenCalled()
  })
})
