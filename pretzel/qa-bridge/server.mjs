#!/usr/bin/env node
/**
 * QA bridge server for the pretzel browser extension — a browse-compatible
 * automation backend, same client/server split as pretzel-desktop's
 * qa-bridge, but backed by a real Chromium context with the extension
 * loaded (chromium.launchPersistentContext + --load-extension) instead of
 * an Electron app. Reuses the exact launch args e2e/playwright.config.ts's
 * `extension` project already proved work around the MV3 headless
 * service-worker bug (headless:false + manual --headless=new).
 */
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST_PATH = path.join(ROOT, 'dist')
const FIXTURES_URL = 'http://localhost:9876'
const PORT = Number(process.env.QA_BRIDGE_PORT || 18898)

let context = null
let extId = null
let currentPage = null
let consoleLog = []
let fixturesProc = null

async function ensureFixturesServer() {
  try {
    const res = await fetch(`${FIXTURES_URL}/health`, { signal: AbortSignal.timeout(500) })
    if (res.ok) return
  } catch { /* not running yet, start it */ }
  fixturesProc = spawn(process.execPath, [path.join(ROOT, 'e2e', 'fixtures-server.mjs')], {
    detached: true,
    stdio: 'ignore',
  })
  fixturesProc.unref()
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 300))
    try {
      const res = await fetch(`${FIXTURES_URL}/health`, { signal: AbortSignal.timeout(500) })
      if (res.ok) return
    } catch { /* keep polling */ }
  }
}

async function ensureContext() {
  if (context) return context
  await ensureFixturesServer()
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${DIST_PATH}`,
      `--load-extension=${DIST_PATH}`,
    ],
  })
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  extId = new URL(sw.url()).hostname
  currentPage = context.pages()[0] ?? await context.newPage()
  wireConsole(currentPage)
  return context
}

function wireConsole(page) {
  page.on('console', (msg) => {
    consoleLog.push({ level: msg.type(), text: msg.text(), ts: Date.now() })
  })
  page.on('pageerror', (err) => {
    consoleLog.push({ level: 'error', text: String(err), ts: Date.now() })
  })
}

function resolveGotoTarget(target) {
  if (target === 'options') return `chrome-extension://${extId}/src/options/index.html`
  if (/^(chatgpt|claude|gemini|upload)$/.test(target)) return `${FIXTURES_URL}/${target}-mock.html`
  if (/^https?:\/\//.test(target) || target.startsWith('chrome-extension://')) return target
  return `${FIXTURES_URL}/${target}` // treat bare names as fixture-relative paths
}

const INTERACTIVE_SELECTOR = 'button, a[href], input, textarea, select, [role="button"], [role="link"], [onclick]'

async function cmdSnapshot(args) {
  const interactive = args.includes('-i')
  await ensureContext()
  const elements = await currentPage.evaluate(({ sel, interactive }) => {
    document.querySelectorAll('[data-qa-ref]').forEach((el) => el.removeAttribute('data-qa-ref'))
    const nodes = interactive ? Array.from(document.querySelectorAll(sel)) : Array.from(document.querySelectorAll('body *'))
    return nodes
      .filter((el) => el.offsetParent !== null || el === document.body)
      .map((el, i) => {
        el.setAttribute('data-qa-ref', `e${i + 1}`)
        const role = el.getAttribute('role') || el.tagName.toLowerCase()
        const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('value') || '').trim().slice(0, 80)
        return { ref: `e${i + 1}`, role, name }
      })
  }, { sel: INTERACTIVE_SELECTOR, interactive })
  const lines = elements.map((el) => `@${el.ref} [${el.role}] "${el.name}"`)
  return lines.join('\n') || (interactive ? '(no interactive elements found)' : '(empty page)')
}

function resolveTarget(sel) {
  if (typeof sel === 'string' && /^@e\d+$/.test(sel)) return `[data-qa-ref="${sel.slice(1)}"]`
  return sel
}

async function dispatch(cmd, args) {
  switch (cmd) {
    case 'status': {
      await ensureContext()
      return `Status: healthy\nMode: launched\nExtension: pretzel (id ${extId})\nPages: ${context.pages().length}`
    }
    case 'goto': {
      await ensureContext()
      const url = resolveGotoTarget(args[0])
      await currentPage.goto(url)
      return `Navigated to ${url}`
    }
    case 'snapshot':
      return cmdSnapshot(args)
    case 'click': {
      await ensureContext()
      const target = resolveTarget(args[0])
      await currentPage.click(target)
      return `Clicked ${args[0]}`
    }
    case 'fill': {
      await ensureContext()
      const target = resolveTarget(args[0])
      await currentPage.fill(target, args[1] ?? '')
      return `Filled ${args[0]}`
    }
    case 'console': {
      const errorsOnly = args.includes('--errors')
      const rows = consoleLog.filter((r) => !errorsOnly || r.level === 'error')
      if (rows.length === 0) return ''
      return rows.map((r) => `[${new Date(r.ts).toISOString()}] [${r.level}] ${r.text}`).join('\n')
    }
    case 'links': {
      await ensureContext()
      const links = await currentPage.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]')).map((a) => `${a.textContent?.trim()} → ${a.href}`))
      return links.join('\n') || '(no links on this page)'
    }
    case 'screenshot': {
      await ensureContext()
      const outPath = args[args.length - 1]
      await currentPage.screenshot({ path: outPath })
      return `Screenshot saved: ${outPath}`
    }
    case 'viewport': {
      await ensureContext()
      const [w, h] = (args[0] || '1280x720').split('x').map(Number)
      await currentPage.setViewportSize({ width: w, height: h })
      return `Viewport set to ${w}x${h}`
    }
    case 'responsive': {
      await ensureContext()
      const prefix = args[0] || 'responsive'
      const sizes = [[375, 812, 'mobile'], [768, 1024, 'tablet'], [1280, 720, 'desktop']]
      const saved = []
      for (const [w, h, label] of sizes) {
        await currentPage.setViewportSize({ width: w, height: h })
        const p = `${prefix}-${label}.png`
        await currentPage.screenshot({ path: p })
        saved.push(p)
      }
      return `Saved: ${saved.join(', ')}`
    }
    case 'cookie-import': {
      await ensureContext()
      const fs = await import('node:fs')
      const cookies = JSON.parse(fs.readFileSync(args[0], 'utf-8'))
      await context.addCookies(cookies)
      return `Imported ${cookies.length} cookies`
    }
    case 'js': {
      await ensureContext()
      const result = await currentPage.evaluate(args.join(' '))
      return typeof result === 'string' ? result : JSON.stringify(result)
    }
    default:
      throw new Error(`Unknown command: ${cmd}`)
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/exec') {
    res.writeHead(404)
    res.end()
    return
  }
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', async () => {
    try {
      const { cmd, args } = JSON.parse(body)
      const text = await dispatch(cmd, args || [])
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, text }))
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, text: String(err?.message || err) }))
    }
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[qa-bridge] listening on 127.0.0.1:${PORT}`)
})

async function shutdown() {
  await context?.close()
  fixturesProc?.kill()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
