import { readFileSync } from 'fs'
import path from 'path'

interface SeedState {
  tenantId:   string
  orgToken:   string
  adminToken: string
}

let _cache: SeedState | null = null

export function getSeedState(): SeedState {
  if (!_cache) {
    const raw = readFileSync(path.join(__dirname, '../.seed-state.json'), 'utf-8')
    _cache = JSON.parse(raw) as SeedState
  }
  return _cache
}
