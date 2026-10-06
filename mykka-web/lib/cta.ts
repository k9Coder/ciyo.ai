import { APP_URL, IS_PILOT_MODE } from './config'

// Primary call to action across the site. During the pilot people join through the pricing page
// (which explains the pilot); otherwise they go straight into onboarding.
export function primaryCta(): { label: string; href: string } {
  return IS_PILOT_MODE
    ? { label: 'Join the pilot', href: '/pricing' }
    : { label: 'Start free', href: `${APP_URL}/onboarding` }
}

// What the pilot includes today: the backend `pilot` plan (backend/src/billing/limits.ts) caps seats
// at 50, leaves scans uncapped, and enables every rule kind. Keep this in step with that plan.
export const PILOT_TERMS = 'up to 50 people, no cap on scans'
