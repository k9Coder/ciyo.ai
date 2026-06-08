import type { Metadata } from 'next'
import PricingClient from './PricingClient'

export const metadata: Metadata = {
  title: 'Pricing — Pretzel AI DLP | Free to $15/user/mo',
  description: 'Transparent pricing for AI prompt data loss prevention. Free tier for individuals, $49/mo flat for small teams, $15/user/mo for the full enterprise feature set.',
  openGraph: {
    title: 'Pricing — Pretzel AI DLP | Free to $15/user/mo',
    description: 'Start free. Scale when you need it. No surprise invoices. SOC 2 in progress, GDPR-aligned.',
  },
}

export default function PricingPage() {
  return <PricingClient />
}
