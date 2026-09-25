import { env } from './env'

export const APP_URL       = env.NEXT_PUBLIC_APP_URL
export const IS_PILOT_MODE = env.NEXT_PUBLIC_PILOT_MODE === 'true'

// Community invite. Not configurable per environment; update here if the invite changes.
export const DISCORD_URL = 'https://discord.gg/mykka'
