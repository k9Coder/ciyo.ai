/**
 * Unit tests for hardening.ts — CA-trust + QUIC-block batched into a single
 * elevation. execSync/execFileSync/fs are mocked so no real OS commands or
 * prompts run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockExecSync, mockExecFileSync, mockIsCACertTrusted } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
  mockExecFileSync: vi.fn(),
  mockIsCACertTrusted: vi.fn(() => false),
}))

vi.mock('child_process', () => ({ execSync: mockExecSync, execFileSync: mockExecFileSync }))
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
  it('runs ONE elevated invocation (via execFileSync, no shell) when both CA + QUIC are missing', async () => {
    mockIsCACertTrusted.mockReturnValue(false)
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('show rule')) return 'No rules match the specified criteria.\n'
      return ''
    })
    await ensureHostHardening(CERT)
    // The elevation must go through execFileSync (argv array, no shell — this
    // is what actually pops UAC; execSync would shell out through cmd.exe and
    // mangle the nested quotes, silently no-opping instead).
    expect(mockExecFileSync).toHaveBeenCalledTimes(1)
    const [bin, args] = mockExecFileSync.mock.calls[0]!
    expect(bin).toBe('powershell.exe')
    expect(args).toContain('-File')
    // Never elevate by shelling a "...RunAs..." string through execSync.
    const shelledElevation = mockExecSync.mock.calls.find(([c]) => typeof c === 'string' && c.includes('RunAs'))
    expect(shelledElevation).toBeUndefined()
  })

  it('does nothing when CA is trusted AND QUIC is blocked', async () => {
    mockIsCACertTrusted.mockReturnValue(true)
    mockExecSync.mockReturnValue('Rule Name: Pretzel Desktop - Block QUIC (UDP 443)\n')
    await ensureHostHardening(CERT)
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  it('never throws when elevation fails or is declined', async () => {
    mockIsCACertTrusted.mockReturnValue(false)
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('show rule')) return 'No rules match.\n'
      return ''
    })
    mockExecFileSync.mockImplementation(() => { throw new Error('user declined UAC') })
    await expect(ensureHostHardening(CERT)).resolves.toBeUndefined()
  })
})
