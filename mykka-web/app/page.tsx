import type { Metadata } from 'next'
import { Hero } from '@/components/sections/Hero'
import { FactsStrip } from '@/components/sections/FactsStrip'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { WhatItCatches } from '@/components/sections/WhatItCatches'
import { ConsolePreview } from '@/components/sections/ConsolePreview'
import { PricingPreview } from '@/components/sections/PricingPreview'
import { FAQ } from '@/components/sections/FAQ'
import { FAQ_ITEMS } from '@/components/sections/faq-data'
import { CTABanner } from '@/components/sections/CTABanner'

export const metadata: Metadata = {
  title: 'Pretzel by mykka.ai — AI Data Loss Prevention for Enterprise',
  description: 'Pretzel is a Chrome extension that prevents employees from sending sensitive data — PII, credentials, source code — to AI tools like ChatGPT, Claude, and Gemini. Browser-native AI DLP that intercepts prompts before submission. Free for teams up to 3 users.',
  alternates: { canonical: 'https://mykka.ai/' },
  openGraph: {
    title: 'Pretzel — Browser-Native AI DLP by mykka.ai',
    description: 'Stop your team from leaking secrets to AI. Pretzel intercepts every prompt before it\'s sent — blocking PII, credentials, and source code automatically. No network changes required.',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://mykka.ai/#org',
      name: 'mykka.ai',
      url: 'https://mykka.ai',
      logo: { '@type': 'ImageObject', url: 'https://mykka.ai/images/logo.png', width: 512, height: 512 },
      description: 'mykka.ai builds Pretzel, a browser-native AI data loss prevention platform that prevents employees from sending sensitive data to AI tools like ChatGPT, Claude, and Gemini.',
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
      operatingSystem: 'Chrome',
      browserRequirements: 'Requires Google Chrome',
      description: 'Pretzel is a Chrome browser extension that prevents employees from sending sensitive organizational data — PII, credentials, source code, API keys — to AI tools like ChatGPT, Claude, and Gemini. Detection runs locally in the browser before any prompt is submitted. Security administrators configure and publish policies through Pretzel Console.',
      url: 'https://mykka.ai/product',
      downloadUrl: 'https://mykka.ai/download',
      offers: [
        {
          '@type': 'Offer',
          name: 'Solo',
          price: '0',
          priceCurrency: 'USD',
          description: 'Free for teams up to 3 users',
        },
        {
          '@type': 'Offer',
          name: 'Business',
          price: '15',
          priceCurrency: 'USD',
          description: 'Per user per month, unlimited users',
        },
      ],
      publisher: { '@id': 'https://mykka.ai/#org' },
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://mykka.ai/#faq',
      mainEntity: FAQ_ITEMS.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
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
      <WhatItCatches />
      <ConsolePreview />
      <PricingPreview />
      <FAQ />
      <CTABanner />
    </>
  )
}
