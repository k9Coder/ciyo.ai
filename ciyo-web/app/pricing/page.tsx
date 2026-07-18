import type { Metadata } from 'next'
import PricingClient from './PricingClient'

export const metadata: Metadata = {
  title: 'Plans and Availability',
  description: 'Request current Pretzel plan, billing, and availability information.',
}

export default function PricingPage() {
  return <PricingClient />
}
