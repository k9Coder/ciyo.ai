import { env } from './env'

export const APP_URL       = env.NEXT_PUBLIC_APP_URL
export const IS_PILOT_MODE = env.NEXT_PUBLIC_PILOT_MODE === 'true'
