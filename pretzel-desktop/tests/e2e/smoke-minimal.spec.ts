// TEMP: isolate whether the CI hang is environment-level or in our app code.
import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const LOG_PATH = path.join(__dirname, 'smoke/smoke-debug.log')

test('minimal electron app opens a window', async () => {
  try { fs.rmSync(LOG_PATH) } catch { /* no prior file */ }

  const app = await electron.launch({
    args: [path.join(__dirname, 'smoke/minimal-main.js')],
  })
  app.process().stdout?.on('data', (d) => console.log('[smoke stdout]', d.toString()))
  app.process().stderr?.on('data', (d) => console.log('[smoke stderr]', d.toString()))

  try {
    await app.firstWindow()
    expect(app.windows().length).toBeGreaterThan(0)
  } finally {
    try {
      console.log('[smoke-debug-file]\n' + fs.readFileSync(LOG_PATH, 'utf-8'))
    } catch (err) {
      console.log('[smoke-debug-file] could not read log:', err)
    }
    await app.close()
  }
})
