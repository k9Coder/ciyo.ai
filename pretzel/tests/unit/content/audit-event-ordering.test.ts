/**
 * Tests for audit event write ordering in content-script.ts
 *
 * Before the fix:
 *   - "sent" was written BEFORE showing the modal, regardless of outcome.
 *   - If user clicked "Edit prompt", a second "edited" event was also written.
 *   - Result: every warned/blocked prompt got two audit events.
 *
 * After the fix:
 *   - For log-only results (no modal): one "sent" event.
 *   - For warn/block + user edits: one "edited" event only.
 *   - For warn/block + user sends anyway: one "sent_with_reason" event only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DetectionResult } from '@/detection/types'

// ─── Stubs ────────────────────────────────────────────────────────────────────

vi.stubGlobal('document', {
  addEventListener: vi.fn(),
  getElementById: vi.fn().mockReturnValue(null),
  createElement: vi.fn().mockReturnValue({
    id: '',
    style: {},
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    remove: vi.fn(),
  }),
  body: {
    appendChild: vi.fn(),
    contains: vi.fn().mockReturnValue(false),
  },
})

vi.stubGlobal('chrome', {
  storage: {
    local: { get: vi.fn().mockResolvedValue({}) },
    sync: { get: vi.fn().mockResolvedValue({}) },
    managed: { get: vi.fn().mockResolvedValue({}) },
  },
  runtime: { sendMessage: vi.fn() },
})

vi.stubGlobal('location', { hostname: 'chatgpt.com' })
vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('test-uuid') })

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockAppendAuditEvent = vi.fn().mockResolvedValue(undefined)
vi.mock('@/audit/log', () => ({
  appendAuditEvent: (...args: unknown[]) => mockAppendAuditEvent(...args),
}))

const mockShowWarningModal = vi.fn()
vi.mock('@/content/overlay/overlay-root', () => ({
  showWarningModal: (...args: unknown[]) => mockShowWarningModal(...args),
}))

const mockSendMessage = vi.fn()
vi.mock('@/shared/messages', () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}))

vi.mock('@/content/adapters/registry', () => ({
  getAdapter: vi.fn().mockReturnValue({
    name: 'ChatGPT',
    findComposer: vi.fn().mockReturnValue({
      innerText: 'my sensitive prompt',
      focus: vi.fn(),
      contains: vi.fn().mockReturnValue(false),
    }),
    readPromptText: vi.fn().mockReturnValue('my sensitive prompt'),
    writePromptText: vi.fn(),
    onSendIntent: vi.fn(),
    findSendButton: vi.fn().mockReturnValue(null),
  }),
}))

vi.mock('@sentry/browser', () => ({
  captureException: vi.fn(),
  init: vi.fn(),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeResult(highestAction: DetectionResult['highestAction']): DetectionResult {
  return {
    findings: [],
    highestAction,
    promptHash: 'abc123',
    detectedAtMs: Date.now(),
    durationMs: 1,
    signInNudge: undefined,
  }
}

/**
 * Simulates calling the onSendIntent handler that bootstrap() registers.
 * Extracts the handler from the onSendIntent mock call and invokes it.
 */
async function triggerSendIntent() {
  const { getAdapter } = await import('@/content/adapters/registry')
  const adapter = getAdapter('chatgpt.com')
  const [capturedHandler] = (adapter.onSendIntent as ReturnType<typeof vi.fn>).mock.calls[0] as [
    (e: Event) => Promise<{ proceed: boolean }>
  ]
  return capturedHandler(new Event('click'))
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  mockSendMessage.mockResolvedValue({ scanLimitReached: false })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('content-script audit event ordering', () => {
  it('writes exactly one "sent" event for log-only results (no modal)', async () => {
    const logResult = makeResult('log')
    mockSendMessage.mockImplementation((msg: { type: string }) => {
      if (msg.type === 'GET_SCAN_LIMIT_STATUS') return Promise.resolve({ scanLimitReached: false })
      if (msg.type === 'DETECT') return Promise.resolve(logResult)
      return Promise.resolve(null)
    })

    await import('@/content/content-script')
    await triggerSendIntent()

    const auditCalls = mockAppendAuditEvent.mock.calls
    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0][0]).toMatchObject({ userDecision: 'sent' })
    expect(mockShowWarningModal).not.toHaveBeenCalled()
  })

  it('writes exactly one "edited" event when user clicks Edit (no "sent" before modal)', async () => {
    const warnResult = makeResult('warn')
    mockSendMessage.mockImplementation((msg: { type: string }) => {
      if (msg.type === 'GET_SCAN_LIMIT_STATUS') return Promise.resolve({ scanLimitReached: false })
      if (msg.type === 'DETECT') return Promise.resolve(warnResult)
      return Promise.resolve(null)
    })
    mockShowWarningModal.mockResolvedValue({ type: 'edit' })

    await import('@/content/content-script')
    await triggerSendIntent()

    const auditCalls = mockAppendAuditEvent.mock.calls
    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0][0]).toMatchObject({ userDecision: 'edited' })
  })

  it('writes exactly one "sent_with_reason" event when user sends anyway', async () => {
    const blockResult = makeResult('block')
    mockSendMessage.mockImplementation((msg: { type: string }) => {
      if (msg.type === 'GET_SCAN_LIMIT_STATUS') return Promise.resolve({ scanLimitReached: false })
      if (msg.type === 'DETECT') return Promise.resolve(blockResult)
      return Promise.resolve(null)
    })
    mockShowWarningModal.mockResolvedValue({ type: 'send_anyway', reason: 'false positive' })

    await import('@/content/content-script')
    await triggerSendIntent()

    const auditCalls = mockAppendAuditEvent.mock.calls
    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0][0]).toMatchObject({
      userDecision: 'sent_with_reason',
      reason: 'false positive',
    })
  })
})
