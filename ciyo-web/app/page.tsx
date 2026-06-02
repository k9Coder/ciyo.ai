import { Hero } from '@/components/sections/Hero'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { FeatureGrid } from '@/components/sections/FeatureGrid'
import { VideoDemo } from '@/components/sections/VideoDemo'
import { PricingPreview } from '@/components/sections/PricingPreview'
import { CTABanner } from '@/components/sections/CTABanner'

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <FeatureGrid />
      <VideoDemo />
      <PricingPreview />
      <CTABanner />
    </>
  )
}
