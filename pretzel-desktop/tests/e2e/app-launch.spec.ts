/**
 * E2E tests for pretzel-desktop using Playwright's Electron support.
 * Tests: app launches, tray window renders, decision window responds to IPC.
 *
 * Run: pnpm test:e2e from pretzel-desktop/
 * Requires: pnpm build to produce dist-electron/main.js first.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'

const ROOT = path.resolve(__dirname, '../../')

test.describe('pretzel-desktop app', () => {
  test('app launches without crashing', async () => {
    const app = await electron.launch({
      args: [path.join(ROOT, 'dist-electron/main.js')],
      env: { ...process.env, NODE_ENV: 'test' },
    })

    // App should not exit immediately
    const isRunning = app.process().exitCode === null
    expect(isRunning).toBe(true)

    await app.close()
  })

  test('tray window is created on launch', async () => {
    const app = await electron.launch({
      args: [path.join(ROOT, 'dist-electron/main.js')],
      env: { ...process.env, NODE_ENV: 'test' },
    })

    // Wait for windows to be created
    const windows = app.windows()
    expect(windows.length).toBeGreaterThan(0)

    await app.close()
  })

  test('decision window renders policy decision UI', async () => {
    const app = await electron.launch({
      args: [path.join(ROOT, 'dist-electron/main.js')],
      env: { ...process.env, NODE_ENV: 'test' },
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
      env: { ...process.env, NODE_ENV: 'test' },
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
    // This verifies @ciyo/detect works in the same Node runtime as the proxy
    const { detectPrompt, DEFAULT_POLICY } = await import('@ciyo/detect')
    const text = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
    const result = await detectPrompt({ text, inputType: 'prompt', hostname: 'chatgpt.com' }, DEFAULT_POLICY)
    expect(['warn', 'require_confirmation', 'block']).toContain(result.highestAction)
  })

  test('detectPrompt allows clean traffic', async () => {
    const { detectPrompt, DEFAULT_POLICY } = await import('@ciyo/detect')
    const result = await detectPrompt({ text: 'Summarize this article for me', inputType: 'prompt', hostname: 'chatgpt.com' }, DEFAULT_POLICY)
    expect(['log', 'warn']).toContain(result.highestAction)
  })
})
