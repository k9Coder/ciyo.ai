/**
 * Update version check.
 *
 * We don't ship an in-app auto-updater yet (unsigned beta — macOS auto-update
 * requires notarization). Instead we ask mykka.ai what the latest published
 * version is and, if we're behind, tell the user to grab the new installer from
 * the download page. Runs once on launch and on demand from the tray UI's
 * "Check for updates" button.
 */
import { app } from 'electron'

const DEFAULT_VERSION_URL = 'https://mykka.ai/api/desktop-version'
const DEFAULT_DOWNLOAD_URL = 'https://mykka.ai/download'

/** Override for staging/QA via env; falls back to production mykka.ai. */
export const VERSION_URL = process.env.PRETZEL_VERSION_URL || DEFAULT_VERSION_URL
export const DOWNLOAD_URL = process.env.PRETZEL_DOWNLOAD_URL || DEFAULT_DOWNLOAD_URL

export interface UpdateStatus {
  current: string
  latest: string | null
  updateAvailable: boolean
}

/**
 * Compare two `x.y.z` version strings.
 * Returns > 0 if a is newer, < 0 if older, 0 if equal.
 * Missing/short segments are treated as 0; non-numeric segments as 0.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = Number.parseInt(pa[i] ?? '0', 10) || 0
    const nb = Number.parseInt(pb[i] ?? '0', 10) || 0
    if (na !== nb) return na - nb
  }
  return 0
}

/**
 * Fetch the latest published version and compare to the running one.
 * Never throws — network/parse failures resolve to `updateAvailable: false`
 * (a failed check must never nag or block the user).
 */
export async function checkForUpdate(): Promise<UpdateStatus> {
  const current = app.getVersion()
  try {
    const res = await fetch(VERSION_URL, { headers: { accept: 'application/json' } })
    if (!res.ok) return { current, latest: null, updateAvailable: false }

    const body = (await res.json()) as { latest?: unknown }
    const latest = typeof body.latest === 'string' ? body.latest : null
    if (!latest) return { current, latest: null, updateAvailable: false }

    return { current, latest, updateAvailable: compareVersions(latest, current) > 0 }
  } catch {
    return { current, latest: null, updateAvailable: false }
  }
}
