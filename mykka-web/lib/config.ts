import { env } from './env'

export const APP_URL       = env.NEXT_PUBLIC_APP_URL
export const IS_PILOT_MODE = env.NEXT_PUBLIC_PILOT_MODE === 'true'

// Pretzel Desktop downloads are off unless an environment opts in. When off, the site offers only
// the Chrome extension: /download drops the Windows/Mac installers and nothing links to them.
// /api/desktop-version keeps answering so already-installed apps can still check for updates.
export const DESKTOP_DOWNLOADS_ENABLED = env.NEXT_PUBLIC_DESKTOP_DOWNLOADS === 'true'

// Community invite. Not configurable per environment; update here if the invite changes.
export const DISCORD_URL = 'https://discord.gg/9NeFB5pA9'

// Chrome Web Store listing. Same store listing for every environment (staging and prod both
// point people at the one published extension), so this is a plain constant, not an env var —
// same treatment as DISCORD_URL above. Update here if the listing is ever republished under a
// different ID.
export const CHROME_EXTENSION_ID = 'kdbpjcacajffjaicggkbelmocbipimoc'
export const CHROME_WEB_STORE_URL = `https://chromewebstore.google.com/detail/pretzel/${CHROME_EXTENSION_ID}`
