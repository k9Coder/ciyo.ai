/**
 * One-shot Sentry verification: loads the built extension in Chrome,
 * waits for the service worker, triggers an unhandled error, and
 * asserts a POST envelope arrives at ingest.de.sentry.io.
 *
 * Run: node verify-sentry.mjs
 */

import { chromium } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, 'dist')

;(async () => {
  // Use the Playwright-managed Chromium (supports extensions + service workers).
  const chromiumExe = 'C:/Users/yarin/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

  const ctx = await chromium.launchPersistentContext('', {
    executablePath: chromiumExe,
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
    ],
  })

  // Open a page first so the extension service worker activates
  const page = await ctx.newPage()
  await page.goto('about:blank')

  const sw = ctx.serviceWorkers()[0]
    ?? await ctx.waitForEvent('serviceworker', { timeout: 15_000 })

  console.log('✅ Service worker registered:', sw.url())

  let sentryRequest = null

  // Wait for Sentry init session POST to pass before we start watching for errors.
  await new Promise((r) => setTimeout(r, 1_500))

  let errorEnvelopeUrl = null

  ctx.on('request', async (req) => {
    if (!req.url().includes('sentry.io') || req.method() !== 'POST') return
    try {
      const body = req.postData() ?? ''
      // Sentry envelope format: each item header line contains {"type":"event"} for real errors.
      if (body.includes('"type":"event"') || body.includes('"type": "event"')) {
        errorEnvelopeUrl = req.url()
      }
    } catch {
      // postData() throws on some preflight requests — ignore
    }
  })

  // throw inside setTimeout fires a real `error` event (not unhandledrejection).
  // Sentry's globalHandlersIntegration installs self.onerror which catches this.
  await sw.evaluate(() => {
    setTimeout(() => {
      // eslint-disable-next-line no-undef
      myUndefinedFunction()
    }, 0)
  })

  // Give Sentry up to 8 s to capture, batch, and flush.
  const deadline = Date.now() + 8_000
  while (!errorEnvelopeUrl && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200))
  }

  if (errorEnvelopeUrl) {
    console.log('✅ PASS — Sentry error envelope captured:', errorEnvelopeUrl)
  } else {
    console.error('❌ FAIL — No Sentry error envelope observed within 8 s')
  }

  await ctx.close()
  process.exit(errorEnvelopeUrl ? 0 : 1)
})()
