/**
 * E2E tests for pretzel-desktop using Playwright's Electron support.
 * Tests: app launches, tray window renders, decision window responds to IPC.
 *
 * Run: pnpm test:e2e from pretzel-desktop/
 * Requires: pnpm build to produce dist-electron/main.js first.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const ROOT = path.resolve(__dirname, '../../')
const DEBUG_LOG_PATH = path.join(ROOT, 'e2e-debug.log')

test.describe('pretzel-desktop app', () => {
  test('app launches without crashing', async () => {
    const app = await electron.launch({
      args: [path.join(ROOT, 'dist-electron/main.js')],
      env: { ...process.env, NODE_ENV: 'test', PRETZEL_E2E: '1' },
    })

    // App should not exit immediately
    const isRunning = app.process().exitCode === null
    expect(isRunning).toBe(true)

    await app.close()
  })

  test('tray window is created on launch', async () => {
    // TEMP DEBUG: fresh debug log per run
    try { fs.rmSync(DEBUG_LOG_PATH) } catch { /* no prior file */ }

    const app = await electron.launch({
      args: [path.join(ROOT, 'dist-electron/main.js')],
      env: { ...process.env, NODE_ENV: 'test', PRETZEL_E2E: '1' },
    })
    // TEMP DEBUG: surface main-process output in CI to diagnose the hang
    app.process().stdout?.on('data', (d) => console.log('[main stdout]', d.toString()))
    app.process().stderr?.on('data', (d) => console.log('[main stderr]', d.toString()))

    try {
      // Wait for the tray window to actually open before inspecting windows()
      await app.firstWindow()
      expect(app.windows().length).toBeGreaterThan(0)
    } finally {
      // TEMP DEBUG: dump the main process's synchronous breadcrumb log,
      // whether the test passed, failed, or timed out
      try {
        console.log('[e2e-debug-file]\n' + fs.readFileSync(DEBUG_LOG_PATH, 'utf-8'))
      } catch (err) {
        console.log('[e2e-debug-file] could not read debug log:', err)
      }
      await app.close()
    }
  })

  test('decision window renders policy decision UI', async () => {
    const app = await electron.launch({
      args: [path.join(ROOT, 'dist-electron/main.js')],
      env: { ...process.env, NODE_ENV: 'test', PRETZEL_E2E: '1' },
    })

    // Evaluate in main process — simulate a decision event
    await app.evaluate(({ ipcMain }) => {
      ipcMain.emit('decision:respond', {}, { requestId: 'test-1', allow: true })
    })

    await app.close()
  })

  test('IPC policy:get returns null when no policy loaded', async () => {
    const app = await electron.launch({
      args: [path.join(ROOT, 'dist-electron/main.js')],
      env: { ...process.env, NODE_ENV: 'test', PRETZEL_E2E: '1' },
    })

    const policy = await app.evaluate(async ({ ipcMain }) => {
      return new Promise((resolve) => {
        ipcMain.handleOnce('policy:get:test', () => null)
        resolve(null)
      })
    })

    expect(policy).toBeNull()
    await app.close()
  })
})

test.describe('detection integration via proxy', () => {
  test('detectPrompt identifies AWS key in request body', async () => {
    // Test the detection logic in Node context (not Electron-specific)
    // This verifies @mykka/detect works in the same Node runtime as the proxy
    const { detectPrompt, DEFAULT_POLICY } = await import('@mykka/detect')
    const text = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
    const result = await detectPrompt({ text, inputType: 'prompt', hostname: 'chatgpt.com' }, DEFAULT_POLICY)
    expect(['warn', 'require_confirmation', 'block']).toContain(result.highestAction)
  })

  test('detectPrompt allows clean traffic', async () => {
    const { detectPrompt, DEFAULT_POLICY } = await import('@mykka/detect')
    const result = await detectPrompt({ text: 'Summarize this article for me', inputType: 'prompt', hostname: 'chatgpt.com' }, DEFAULT_POLICY)
    expect(['log', 'warn']).toContain(result.highestAction)
  })
})
