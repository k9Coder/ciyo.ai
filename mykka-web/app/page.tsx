import type { Metadata } from 'next'
import { Hero } from '@/components/sections/Hero'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { AEOAnswers } from '@/components/sections/AEOAnswers'
import { FeatureGrid } from '@/components/sections/FeatureGrid'
import { PricingPreview } from '@/components/sections/PricingPreview'
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
      description: 'mykka.ai builds Pretzel, a browser-native AI data loss prevention platform that prevents employees from sending sensitive data to AI tools like ChatGPT, Claude, and Gemini.',
      foundingDate: '2024',
      sameAs: [
        'https://www.linkedin.com/company/mykka-ai',
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
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is Pretzel?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Pretzel is a Chrome browser extension that prevents employees from accidentally sending sensitive data to AI tools like ChatGPT, Claude, and Gemini. It intercepts every AI prompt before it is submitted, scanning for PII, source code, API keys, credentials, and other sensitive content. When a policy violation is detected, Pretzel blocks the prompt and shows the user exactly what was caught. Security administrators manage policies through Pretzel Console, a centralized dashboard with rule management, audit logs, and analytics.',
          },
        },
        {
          '@type': 'Question',
          name: 'What is AI DLP?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'AI DLP — Artificial Intelligence Data Loss Prevention — is a category of security software designed to prevent employees from sharing sensitive organizational data with AI tools and large language models. Traditional DLP solutions cannot intercept browser-based AI prompt submissions. AI DLP tools close this gap by monitoring and blocking sensitive content at the point of input, before a prompt reaches the AI provider\'s servers.',
          },
        },
        {
          '@type': 'Question',
          name: 'How is browser-native AI DLP different from network DLP?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Browser-native AI DLP operates inside the web browser, intercepting prompts before submission — before any data leaves the user\'s device. Network-level DLP inspects traffic after it has been sent and cannot read encrypted HTTPS without complex TLS inspection setups. Pretzel reads the full unencrypted prompt text at the point of input, requires no network configuration changes, and can be installed by employees in under a minute.',
          },
        },
      ],
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
      <HowItWorks />
      <AEOAnswers />
      <FeatureGrid />
      <PricingPreview />
      <CTABanner />
    </>
  )
}
