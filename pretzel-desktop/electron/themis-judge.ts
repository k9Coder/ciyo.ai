import path from 'node:path'
import { app } from 'electron'

export function resolveModelDir(): string {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'models')
    : path.join(__dirname, '../resources/models')
  return path.join(base, 'themis')
}

export interface VocabRemap {
  old_to_new: Record<string, number>
  fallback_new_id: number
}

export function remapIds(ids: Iterable<bigint>, remap: VocabRemap): BigInt64Array {
  const { old_to_new, fallback_new_id } = remap
  return BigInt64Array.from(ids, (id) => {
    const mapped = old_to_new[String(id)]
    return BigInt(mapped ?? fallback_new_id)
  })
}

export function softmax(xs: Float32Array | number[]): number[] {
  const max = Math.max(...xs)
  const exps = Array.from(xs, (x) => Math.exp(x - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / sum)
}
