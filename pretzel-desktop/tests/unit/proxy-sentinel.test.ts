/**
 * Unit tests for proxy-sentinel.ts. spawn/execFileSync/writeFileSync mocked —
 * no real scheduled task, detached process, or file writes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockSpawn, mockUnref, mockExecFileSync, mockWriteFileSync, mockUnlinkSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockUnref: vi.fn(),
  mockExecFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
}))

vi.mock('child_process', () => ({ spawn: mockSpawn, execFileSync: mockExecFileSync }))
vi.mock('fs', () => ({
  default: { writeFileSync: mockWriteFileSync, unlinkSync: mockUnlinkSync },
  writeFileSync: mockWriteFileSync,
  unlinkSync: mockUnlinkSync,
}))

import { spawnProxySentinel } from '../../electron/proxy-sentinel'

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}
const realPlatform = process.platform

beforeEach(() => {
  vi.clearAllMocks()
  mockSpawn.mockReturnValue({ unref: mockUnref })
})
afterEach(() => setPlatform(realPlatform))

describe('spawnProxySentinel (win32)', () => {
  beforeEach(() => setPlatform('win32'))

  it('writes a watcher script that polls this process\'s own PID and checks the given port', () => {
    spawnProxySentinel(18888)

    const scriptWrite = mockWriteFileSync.mock.calls.find(([p]) => String(p).includes(`pretzel-sentinel-${process.pid}.ps1`))
    expect(scriptWrite).toBeDefined()
    expect(String(scriptWrite![1])).toContain(`Get-Process -Id ${process.pid}`)
    expect(String(scriptWrite![1])).toContain('127.0.0.1:18888')
  })

  it('registers and immediately starts a one-shot scheduled task, not a spawned child process', () => {
    // Regression test: two earlier attempts (spawn({ detached: true }), then
    // a Start-Process handoff) both failed the same live test — Windows
    // Terminal/ConPTY assigns its whole process tree to a Job Object with
    // kill-on-close semantics, which is unrelated to process groups and
    // survives neither detached spawning nor ShellExecute handoffs. Task
    // Scheduler is the only mechanism in this codebase proven immune to it
    // (see proxy-watchdog.ts) — this must go through the same path, not a
    // process spawned as any kind of descendant of this one.
    spawnProxySentinel(18888)

    expect(mockSpawn).not.toHaveBeenCalled()
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-File', expect.stringContaining('pretzel-sentinel-register-')]),
      expect.anything(),
    )

    const registerWrite = mockWriteFileSync.mock.calls.find(([p]) => String(p).includes('pretzel-sentinel-register-'))
    expect(registerWrite).toBeDefined()
    const registerContent = String(registerWrite![1])
    expect(registerContent).toContain('Register-ScheduledTask')
    expect(registerContent).toContain('Start-ScheduledTask') // fired now, not left for a future trigger
    expect(registerContent).toContain(`PretzelDesktopSentinel${process.pid}`)
  })

  it('the watcher script unregisters its own one-shot task once done (no Task Scheduler clutter)', () => {
    spawnProxySentinel(18888)

    const scriptWrite = mockWriteFileSync.mock.calls.find(([p]) => String(p).includes(`pretzel-sentinel-${process.pid}.ps1`))
    expect(String(scriptWrite![1])).toContain(`Unregister-ScheduledTask -TaskName "PretzelDesktopSentinel${process.pid}"`)
  })

  it('cleans up the temporary register script after running it', () => {
    spawnProxySentinel(18888)
    expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('pretzel-sentinel-register-'))
  })

  it('never throws even if registering the task fails entirely', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('schtasks unavailable') })
    expect(() => spawnProxySentinel(18888)).not.toThrow()
  })
})

describe('spawnProxySentinel (darwin)', () => {
  beforeEach(() => setPlatform('darwin'))

  it('spawns a detached shell script polling the PID', () => {
    spawnProxySentinel(18888)

    expect(mockSpawn).toHaveBeenCalledWith(
      '/bin/sh',
      expect.arrayContaining([expect.stringContaining('pretzel-sentinel-')]),
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    )
    const scriptWrite = mockWriteFileSync.mock.calls[0]
    expect(String(scriptWrite[1])).toContain(`kill -0 ${process.pid}`)
  })
})

describe('spawnProxySentinel (linux)', () => {
  beforeEach(() => setPlatform('linux'))

  it('spawns a detached shell script checking gsettings', () => {
    spawnProxySentinel(18888)

    const scriptWrite = mockWriteFileSync.mock.calls[0]
    expect(String(scriptWrite[1])).toContain('gsettings')
    expect(String(scriptWrite[1])).toContain(`kill -0 ${process.pid}`)
  })
})
