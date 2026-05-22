import { getSeedState } from './seed-state.js'

export function adminHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getSeedState().adminToken}` }
}
