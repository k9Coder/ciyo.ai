#!/usr/bin/env node
/**
 * QA bridge server for pretzel-desktop — an Electron-native stand-in for
 * gstack's browse binary, exposing the same command surface (goto, snapshot,
 * click, fill, console, screenshot, js, links, viewport, responsive,
 * cookie-import, status) so /qa-desktop (a fork of /qa) can drive this app.
 *
 * Architecture mirrors gstack browse: a persistent background server holds
 * the live Electron app + Playwright state; the `cli.mjs` client is a thin
 * argv-to-HTTP wrapper. One command per process would be too slow (losing
 * app/window state between calls) and lose the ref map snapshot->click needs.
 */
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const MAIN_JS = path.join(ROOT, 'dist-electron/main.js')
const PORT = Number(process.env.QA_BRIDGE_PORT || 18899)

let app = null
let currentPage = null
let refMap = new Map() // "e1" -> ElementHandle, populated by snapshot
let consoleLog = [] // { level, text, ts }
let refCounter = 0

async function ensureApp() {
  if (app) return app
  // The harness that runs this server sets ELECTRON_RUN_AS_NODE=1 (so its own
  // spawned tooling behaves as plain Node); Electron itself checks this var
  // and, if set, refuses to boot the actual app (electron.app is undefined).
  // Must be absent, not just falsy, for the child process.
  const env = { ...process.env, NODE_ENV: 'test', PRETZEL_E2E: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: [MAIN_JS],
    env,
  })
  currentPage = await app.firstWindow()
  wireConsole(currentPage)
  return app
}

function wireConsole(page) {
  page.on('console', (msg) => {
    consoleLog.push({ level: msg.type(), text: msg.text(), ts: Date.now() })
  })
  page.on('pageerror', (err) => {
    consoleLog.push({ level: 'error', text: String(err), ts: Date.now() })
  })
}

async function focusWindow(name) {
  await ensureApp()
  const windows = app.windows()
  if (name === 'decision' && windows.length > 1) {
    currentPage = windows[windows.length - 1]
  } else {
    currentPage = await app.firstWindow()
  }
  wireConsole(currentPage)
  await currentPage.bringToFront()
  return currentPage
}

// page.accessibility.snapshot() was removed from this Playwright version, so
// snapshot walks the DOM directly and tags interactive elements with a
// throwaway data attribute — refs (@e1, @e2...) resolve to a plain CSS
// selector on that attribute, which is simpler and more robust than trying
// to hold live ElementHandles across requests.
function resolveTarget(sel) {
  if (typeof sel === 'string' && /^@e\d+$/.test(sel)) {
    if (!refMap.has(sel)) throw new Error(`Unknown ref ${sel} — run snapshot first`)
    return `[data-qa-ref="${sel.slice(1)}"]`
  }
  return sel
}

const INTERACTIVE_SELECTOR = 'button, a[href], input, textarea, select, [role="button"], [role="link"], [onclick]'

async function cmdSnapshot(args) {
  const interactive = args.includes('-i')
  await ensureApp()
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
  refMap = new Map()
  const lines = elements.map((el) => {
    refMap.set(`@${el.ref}`, true)
    return `@${el.ref} [${el.role}] "${el.name}"`
  })
  return lines.join('\n') || (interactive ? '(no interactive elements found)' : '(empty page)')
}

async function dispatch(cmd, args) {
  switch (cmd) {
    case 'status': {
      await ensureApp()
      return `Status: healthy\nMode: launched\nApp: pretzel-desktop (Electron)\nWindows: ${app.windows().length}\nPID: ${app.process().pid}`
    }
    case 'goto': {
      const target = args[0] || 'tray'
      const page = await focusWindow(target)
      return `Focused window: ${target} (${page.url()})`
    }
    case 'snapshot':
      return cmdSnapshot(args)
    case 'click': {
      const target = resolveTarget(args[0])
      await ensureApp()
      if (typeof target === 'string') await currentPage.click(target)
      else await target.click()
      return `Clicked ${args[0]}`
    }
    case 'fill': {
      const target = resolveTarget(args[0])
      const value = args[1] ?? ''
      await ensureApp()
      if (typeof target === 'string') await currentPage.fill(target, value)
      else await target.fill(value)
      return `Filled ${args[0]}`
    }
    case 'console': {
      const errorsOnly = args.includes('--errors')
      const rows = consoleLog.filter((r) => !errorsOnly || r.level === 'error')
      if (rows.length === 0) return ''
      return rows.map((r) => `[${new Date(r.ts).toISOString()}] [${r.level}] ${r.text}`).join('\n')
    }
    case 'links':
      return '(no links — Electron app has fixed windows, not routed pages; use `goto tray|decision`)'
    case 'screenshot': {
      await ensureApp()
      const outPath = args[args.length - 1]
      await currentPage.screenshot({ path: outPath })
      return `Screenshot saved: ${outPath}`
    }
    case 'viewport':
      return '(viewport resize not applicable — pretzel-desktop windows are fixed-size native windows)'
    case 'responsive':
      return '(responsive check not applicable — pretzel-desktop has no responsive layouts, fixed native window sizes)'
    case 'cookie-import':
      return '(not applicable — pretzel-desktop uses native keychain-backed auth, not browser cookies)'
    case 'js': {
      await ensureApp()
      const expr = args.join(' ')
      const result = await currentPage.evaluate(expr)
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

process.on('SIGTERM', async () => { await app?.close(); process.exit(0) })
process.on('SIGINT', async () => { await app?.close(); process.exit(0) })
