import { getSeedState } from './seed-state.js'

export function orgHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getSeedState().orgToken}` }
}
