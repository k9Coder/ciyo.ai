import path from 'path'
import fs from 'fs'

// TEMP DEBUG: synchronous, bypasses Node's buffered stdout so it survives
// a force-kill. See main.ts for why console.log isn't reliable here.
const DEBUG_LOG_PATH = path.join(__dirname, '../e2e-debug.log')

export function debugLog(msg: string): void {
  if (process.env.PRETZEL_E2E === '1') {
    try {
      fs.appendFileSync(DEBUG_LOG_PATH, `${new Date().toISOString()} ${msg}\n`)
    } catch {
      // best-effort debug logging only
    }
  }
}
