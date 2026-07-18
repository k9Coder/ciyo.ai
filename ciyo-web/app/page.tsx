import type { Metadata } from 'next'
import { Hero } from '@/components/sections/Hero'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { FeatureGrid } from '@/components/sections/FeatureGrid'
import { PricingPreview } from '@/components/sections/PricingPreview'
import { CTABanner } from '@/components/sections/CTABanner'

export const metadata: Metadata = {
  title: 'Pretzel by ciyo.ai - AI Prompt Policy',
  description: 'An authenticated Chrome extension that evaluates prompts locally on supported ChatGPT, Claude, and Gemini hosts.',
}

export default function HomePage() {
  return <><Hero /><HowItWorks /><FeatureGrid /><PricingPreview /><CTABanner /></>
}
