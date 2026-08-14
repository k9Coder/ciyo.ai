/**
 * Unit tests for hardening.ts — CA-trust + QUIC-block batched into a single
 * elevation. execSync/fs are mocked so no real OS commands or prompts run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockExecSync, mockIsCACertTrusted } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
  mockIsCACertTrusted: vi.fn(() => false),
}))

vi.mock('child_process', () => ({ execSync: mockExecSync }))
vi.mock('fs', () => ({ default: { writeFileSync: vi.fn(), unlinkSync: vi.fn() }, writeFileSync: vi.fn(), unlinkSync: vi.fn() }))
vi.mock('../../electron/ca', () => ({ isCACertTrusted: mockIsCACertTrusted }))

import { ensureHostHardening, isQuicBlocked } from '../../electron/hardening'

const CERT = 'C:/Users/x/pretzel-ca.crt'

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}
const realPlatform = process.platform

beforeEach(() => {
  vi.clearAllMocks()
  mockIsCACertTrusted.mockReturnValue(false)
  setPlatform('win32')
})
afterEach(() => setPlatform(realPlatform))

describe('isQuicBlocked (win32)', () => {
  it('false when the firewall rule is absent', () => {
    mockExecSync.mockReturnValue('No rules match the specified criteria.\n')
    expect(isQuicBlocked()).toBe(false)
  })
  it('true when the rule exists', () => {
    mockExecSync.mockReturnValue('Rule Name: Pretzel Desktop - Block QUIC (UDP 443)\nEnabled: Yes\n')
    expect(isQuicBlocked()).toBe(true)
  })
})

describe('ensureHostHardening', () => {
  it('runs ONE elevated invocation when both CA + QUIC are missing', async () => {
    mockIsCACertTrusted.mockReturnValue(false)
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('show rule')) return 'No rules match the specified criteria.\n'
      return ''
    })
    await ensureHostHardening(CERT)
    // Exactly one elevation (Start-Process -Verb RunAs); the show-rule query
    // above is a read, not an elevation.
    const elevations = mockExecSync.mock.calls.filter(([c]) => typeof c === 'string' && c.includes('RunAs'))
    expect(elevations).toHaveLength(1)
  })

  it('does nothing when CA is trusted AND QUIC is blocked', async () => {
    mockIsCACertTrusted.mockReturnValue(true)
    mockExecSync.mockReturnValue('Rule Name: Pretzel Desktop - Block QUIC (UDP 443)\n')
    await ensureHostHardening(CERT)
    const elevations = mockExecSync.mock.calls.filter(([c]) => typeof c === 'string' && c.includes('RunAs'))
    expect(elevations).toHaveLength(0)
  })

  it('never throws when elevation fails or is declined', async () => {
    mockIsCACertTrusted.mockReturnValue(false)
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('show rule')) return 'No rules match.\n'
      if (cmd.includes('RunAs')) throw new Error('user declined UAC')
      return ''
    })
    await expect(ensureHostHardening(CERT)).resolves.toBeUndefined()
  })
})
