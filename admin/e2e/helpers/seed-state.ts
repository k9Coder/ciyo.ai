import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface SeedState {
  tenantId:               string
  orgToken:               string
  adminToken:             string
  assistantSessionId:     string
  assistantMessageId:     string
  assistantFlowMessageId: string
  freeTenantId:           string
  freeOrgToken:           string
  freeAdminToken:         string
}

let _cache: SeedState | null = null

export function getSeedState(): SeedState {
  if (!_cache) {
    const raw = readFileSync(path.join(__dirname, '../../../e2e/.seed-state.json'), 'utf-8')
    _cache = JSON.parse(raw) as SeedState
  }
  return _cache
}
