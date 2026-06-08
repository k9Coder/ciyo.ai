import type { Metadata } from 'next'
import { Hero } from '@/components/sections/Hero'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { FeatureGrid } from '@/components/sections/FeatureGrid'
import { PricingPreview } from '@/components/sections/PricingPreview'
import { CTABanner } from '@/components/sections/CTABanner'

export const metadata: Metadata = {
  title: 'Pretzel by ciyo.ai — Stop AI Prompt Data Leaks',
  description: 'The Chrome extension that blocks PII, credentials, and IP from reaching ChatGPT, Claude, and Gemini. Installs in 30 seconds. Free for teams up to 3 users.',
  openGraph: {
    title: 'Pretzel — AI Prompt DLP for Enterprise',
    description: 'Stop your team from leaking secrets to AI. Pretzel intercepts every prompt before it\'s sent — blocking PII, credentials, and IP automatically.',
  },
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <FeatureGrid />
      <PricingPreview />
      <CTABanner />
    </>
  )
}
