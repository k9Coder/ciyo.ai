import path from 'node:path'
import { app } from 'electron'

export function resolveModelDir(): string {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'models')
    : path.join(__dirname, '../resources/models')
  return path.join(base, 'themis')
}
