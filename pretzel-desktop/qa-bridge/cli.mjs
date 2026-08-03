#!/usr/bin/env node
/**
 * Thin CLI client for qa-bridge/server.mjs — mirrors gstack browse's own
 * client/server split. Usage: node cli.mjs <command> [args...]
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.QA_BRIDGE_PORT || 18899)
const BASE = `http://127.0.0.1:${PORT}`

async function ping() {
  try {
    const res = await fetch(`${BASE}/exec`, {
      method: 'POST',
      body: JSON.stringify({ cmd: 'status', args: [] }),
      signal: AbortSignal.timeout(1500),
    })
    return res.ok
  } catch {
    return false
  }
}

async function ensureServer() {
  if (await ping()) return
  console.error('[qa-bridge] Starting server...')
  const child = spawn(process.execPath, [path.join(__dirname, 'server.mjs')], {
    detached: true,
    stdio: 'ignore',
    cwd: __dirname,
  })
  child.unref()
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await ping()) return
  }
  throw new Error('[qa-bridge] Server failed to start within 15s')
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  if (!cmd) {
    console.error('Usage: cli.mjs <command> [args...]')
    process.exit(1)
  }
  await ensureServer()
  const res = await fetch(`${BASE}/exec`, {
    method: 'POST',
    body: JSON.stringify({ cmd, args }),
  })
  const { ok, text } = await res.json()
  console.log(text)
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(String(err?.message || err))
  process.exit(1)
})
