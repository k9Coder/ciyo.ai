import type { Metadata } from 'next'
import { IS_PILOT_MODE } from '@/lib/config'
import { Hero } from '@/components/sections/Hero'
import { FactsStrip } from '@/components/sections/FactsStrip'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { ProductParts } from '@/components/sections/ProductParts'
import { TeamsStrip } from '@/components/sections/TeamsStrip'
import { DiscordCard } from '@/components/sections/DiscordCard'
import { CTABanner } from '@/components/sections/CTABanner'

export const metadata: Metadata = {
  title: 'Pretzel by mykka.ai — AI Data Loss Prevention for Enterprise',
  description: IS_PILOT_MODE
    ? 'Pretzel checks every prompt to ChatGPT, Claude and Gemini before it is sent, and catches personal data, passwords and code. Chrome extension and desktop app, with detection on the device. Free during the pilot.'
    : 'Pretzel checks every prompt to ChatGPT, Claude and Gemini before it is sent, and catches personal data, passwords and code. Chrome extension and desktop app, with detection on the device. Free for teams up to 3 users.',
  alternates: { canonical: 'https://mykka.ai/' },
  openGraph: {
    title: 'Pretzel — AI Data Loss Prevention by mykka.ai',
    description: 'Let your team use AI. Keep client data out of it. Pretzel checks every prompt before it\'s sent and offers to remove personal data, passwords and code. No network changes required.',
  },
}

const offers = IS_PILOT_MODE
  ? [{ '@type': 'Offer', name: 'Pilot', price: '0', priceCurrency: 'USD', description: 'Free during the pilot' }]
  : [
      { '@type': 'Offer', name: 'Solo', price: '0', priceCurrency: 'USD', description: 'Free for teams up to 3 users' },
      { '@type': 'Offer', name: 'Business', price: '15', priceCurrency: 'USD', description: 'Per user per month, unlimited users' },
    ]

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://mykka.ai/#org',
      name: 'mykka.ai',
      url: 'https://mykka.ai',
      logo: { '@type': 'ImageObject', url: 'https://mykka.ai/images/logo.png', width: 512, height: 512 },
      description: 'mykka.ai builds Pretzel, an AI data loss prevention platform that prevents employees from sending sensitive data to AI tools like ChatGPT, Claude, and Gemini.',
      foundingDate: '2024',
      sameAs: [
        'https://www.linkedin.com/company/mykka-ai',
        'https://twitter.com/mykka_ai',
      ],
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://mykka.ai/#pretzel',
      name: 'Pretzel',
      alternateName: 'Pretzel by mykka.ai',
      applicationCategory: 'SecurityApplication',
      applicationSubCategory: 'Data Loss Prevention',
      operatingSystem: 'Chrome, Windows, macOS',
      description: 'Pretzel is a Chrome extension and desktop app that prevents employees from sending sensitive organizational data — PII, credentials, source code, API keys — to AI tools like ChatGPT, Claude, and Gemini. Detection runs on the device before any prompt is submitted. Security administrators configure and publish policies through Pretzel Console.',
      url: 'https://mykka.ai/product',
      downloadUrl: 'https://mykka.ai/download',
      offers,
      publisher: { '@id': 'https://mykka.ai/#org' },
    },
  ],
}

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <FactsStrip />
      <HowItWorks />
      <ProductParts />
      <TeamsStrip />
      <DiscordCard />
      <CTABanner />
    </>
  )
}
