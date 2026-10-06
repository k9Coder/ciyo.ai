/**
 * Unit tests for proxy-watchdog.ts. execFileSync/fs mocked — no real scheduled
 * task, launchd agent, or file writes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockExecFileSync, mockWriteFileSync, mockExistsSync, mockUnlinkSync, mockMkdirSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockExistsSync: vi.fn(() => false),
  mockUnlinkSync: vi.fn(),
  mockMkdirSync: vi.fn(),
}))

vi.mock('child_process', () => ({ execFileSync: mockExecFileSync }))
vi.mock('fs', () => ({
  default: {
    writeFileSync: mockWriteFileSync,
    existsSync: mockExistsSync,
    unlinkSync: mockUnlinkSync,
    mkdirSync: mockMkdirSync,
  },
  writeFileSync: mockWriteFileSync,
  existsSync: mockExistsSync,
  unlinkSync: mockUnlinkSync,
  mkdirSync: mockMkdirSync,
}))

import { ensureProxyWatchdog, removeProxyWatchdog } from '../../electron/proxy-watchdog'

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}
const realPlatform = process.platform

beforeEach(() => {
  vi.clearAllMocks()
  mockExistsSync.mockReturnValue(false)
})
afterEach(() => setPlatform(realPlatform))

describe('ensureProxyWatchdog (win32)', () => {
  beforeEach(() => setPlatform('win32'))

  it('writes the watchdog script and registers the task when not already present', () => {
    mockExecFileSync.mockImplementation((bin: string, args: string[]) => {
      if (args.includes('/query')) throw new Error('task not found') // not registered
      return ''
    })
    ensureProxyWatchdog('C:/userdata', 18888)

    // Watchdog check-script written, containing the port it should verify.
    const scriptWrite = mockWriteFileSync.mock.calls.find(([p]) => String(p).includes('proxy-watchdog.ps1'))
    expect(scriptWrite).toBeDefined()
    expect(String(scriptWrite![1])).toContain('127.0.0.1:18888')

    // Registration happened via execFileSync (no shell — argv only).
    const registerCall = mockExecFileSync.mock.calls.find(
      ([bin, args]) => bin === 'powershell.exe' && Array.isArray(args) && args.includes('-File'),
    )
    expect(registerCall).toBeDefined()
  })

  it('does not re-register when the task already exists', () => {
    mockExecFileSync.mockImplementation((_bin: string, args: string[]) => {
      if (args.includes('/query')) return '' // already registered
      return ''
    })
    ensureProxyWatchdog('C:/userdata', 18888)

    const registerCall = mockExecFileSync.mock.calls.find(
      ([bin, args]) => bin === 'powershell.exe' && Array.isArray(args) && args.includes('-File'),
    )
    expect(registerCall).toBeUndefined()
  })

  it('never throws even if scheduling fails entirely', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('schtasks unavailable') })
    expect(() => ensureProxyWatchdog('C:/userdata', 18888)).not.toThrow()
  })
})

describe('removeProxyWatchdog (win32)', () => {
  it('deletes the scheduled task and never throws if it was never registered', () => {
    setPlatform('win32')
    mockExecFileSync.mockImplementation(() => { throw new Error('not found') })
    expect(() => removeProxyWatchdog()).not.toThrow()
  })
})
