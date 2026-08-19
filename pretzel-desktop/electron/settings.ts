/**
 * Local app settings — persisted as JSON in userData. Separate from
 * auth-state.json (sign-in status) and the CA cert file: this is pure user
 * preference, safe to reset independently without touching auth or
 * protection state. Backs the Settings panel in the tray window.
 */
import fs from 'fs'
import path from 'path'
import { z } from 'zod'

export const NotifyLevelSchema = z.enum(['off', 'badge', 'native', 'native-sound'])
export type NotifyLevel = z.infer<typeof NotifyLevelSchema>

const SettingsSchema = z.object({
  hasSeenWalkthrough: z.boolean().default(false),
  // Blocks default to a real native alert — silently dropping a blocked
  // secret with no signal is worse than a slightly noisy first week. Warns
  // default to a quieter badge since they're by design not urgent (the
  // request already went through).
  notifyOnBlock: NotifyLevelSchema.default('native'),
  notifyOnWarn: NotifyLevelSchema.default('badge'),
})
export type Settings = z.infer<typeof SettingsSchema>

/** Partial patch accepted from the (untrusted) renderer via IPC. */
export const SettingsPatchSchema = SettingsSchema.partial()
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

const DEFAULTS: Settings = SettingsSchema.parse({})

function settingsPath(userDataDir: string): string {
  return path.join(userDataDir, 'settings.json')
}

let cached: Settings | null = null
let cachedDir: string | null = null

/** Load settings for the given userData dir, caching until saveSettings() or a dir change. */
export function loadSettings(userDataDir: string): Settings {
  if (cached && cachedDir === userDataDir) return cached
  try {
    const raw = fs.readFileSync(settingsPath(userDataDir), 'utf-8')
    const parsed = SettingsSchema.safeParse(JSON.parse(raw))
    // A corrupt/foreign-shaped file falls back to defaults rather than
    // crashing the app over a preferences file — same "never let a broken
    // secondary file break the primary feature" posture as policy-sync.ts.
    cached = parsed.success ? parsed.data : DEFAULTS
  } catch {
    cached = DEFAULTS
  }
  cachedDir = userDataDir
  return cached
}

/** Merge a validated patch into settings and persist. Returns the full updated settings. */
export function saveSettings(userDataDir: string, patch: SettingsPatch): Settings {
  const next = { ...loadSettings(userDataDir), ...patch }
  fs.writeFileSync(settingsPath(userDataDir), JSON.stringify(next, null, 2), 'utf-8')
  cached = next
  cachedDir = userDataDir
  return next
}

/** Test-only: clear the in-memory cache so each test starts from a clean slate. */
export function _resetSettingsCacheForTest(): void {
  cached = null
  cachedDir = null
}
