import { readFileSync } from 'fs'
import path from 'path'

interface SeedState {
  tenantId:               string
  orgToken:               string
  adminToken:             string
  assistantSessionId:     string
  assistantMessageId:     string
  assistantFlowMessageId: string
  // assistantOrgMessageId is written by backend/scripts/seed-e2e.ts. Declared
  // here to keep the interface in sync with the backend helper so that any
  // future cross-cutting test that needs it gets a compile-time error rather
  // than a silent runtime `undefined`.
  assistantOrgMessageId:  string
  freeTenantId:           string
  freeOrgToken:           string
  freeAdminToken:         string
}

// Module-level cache. Safe because Playwright workers are started *after*
// globalSetup completes and writes .seed-state.json — so no worker will ever
// see a stale version of the file from a prior run.
let _cache: SeedState | null = null

export function getSeedState(): SeedState {
  if (!_cache) {
    const raw = readFileSync(path.join(__dirname, '../.seed-state.json'), 'utf-8')
    _cache = JSON.parse(raw) as SeedState
  }
  return _cache
}
