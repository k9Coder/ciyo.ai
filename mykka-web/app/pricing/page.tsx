import type { Metadata } from 'next'
import PricingClient from './PricingClient'

export const metadata: Metadata = {
  title: 'Pricing — Pretzel AI DLP | Free to $15/user/mo',
  description: 'Transparent pricing for AI prompt data loss prevention. Free tier for individuals, $49/mo flat for small teams, $15/user/mo for the full enterprise feature set.',
  alternates: { canonical: 'https://mykka.ai/pricing' },
  openGraph: {
    title: 'Pricing — Pretzel AI DLP | Free to $15/user/mo',
    description: 'Start free. Scale when you need it. No surprise invoices. SOC 2 in progress, GDPR-aligned.',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  url: 'https://mykka.ai/pricing',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What counts as a scan in Pretzel?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Every time the Pretzel extension evaluates a prompt against your policy rules counts as one scan. Scans are counted when a prompt is submitted, not when the page loads.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does Pretzel AI DLP cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Pretzel is free for up to 3 users. The Starter plan is $49/month flat for up to 25 users. The Business plan is $15 per user per month (or $12 annually) for unlimited users with all detection types, AI policy assistant, and 12-month audit log. Enterprise pricing is custom for 500+ seat deployments.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does Pretzel store the contents of AI prompts?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Pretzel records which rule fired, which AI site, and which member triggered the event. For rules configured to report matched content, a brief excerpt may be retained for audit purposes. Full prompt text is never stored.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a free trial on Pretzel paid plans?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '14-day free trial on Business. No credit card required to start.',
      },
    },
    {
      '@type': 'Question',
      name: 'What happens when I hit my scan limit?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'On the free tier, once you reach 500 scans the extension stops scanning new prompts until the next month begins. Paid tiers have generous limits — most teams never hit them.',
      },
    },
  ],
}

export default function PricingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PricingClient />
    </>
  )
}
