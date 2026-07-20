import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About mykka.ai — The Team Behind Pretzel AI DLP',
  description: 'mykka.ai was founded to solve a problem its team lived firsthand: employees pasting source code and credentials into public AI tools with no guardrails in place. We build Pretzel — browser-native AI DLP for enterprise.',
  alternates: { canonical: 'https://mykka.ai/about' },
  openGraph: {
    title: 'About mykka.ai — The Team Behind Pretzel',
    description: 'A small, customer-funded team obsessed with making enterprise DLP tools people actually use.',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  url: 'https://mykka.ai/about',
  name: 'About mykka.ai',
  description: 'mykka.ai builds Pretzel, a browser-native AI data loss prevention platform for enterprise security teams.',
  mainEntity: {
    '@id': 'https://mykka.ai/#org',
    '@type': 'Organization',
    name: 'mykka.ai',
    url: 'https://mykka.ai',
    foundingDate: '2024',
    description: 'mykka.ai builds Pretzel — a Chrome browser extension that prevents employees from sending sensitive data to AI tools like ChatGPT, Claude, and Gemini.',
    sameAs: ['https://www.linkedin.com/company/mykka-ai'],
    contactPoint: { '@type': 'ContactPoint', email: 'hello@mykka.ai', contactType: 'customer support' },
  },
}

export default function AboutPage() {
  return (
    <div className="px-6 py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-2xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">About</p>
        <h1 className="mb-6 text-5xl font-extrabold tracking-tight text-white">Built for the AI-era by people who lived the problem</h1>
        <div className="space-y-4 text-[15px] leading-relaxed text-[#94a3b8]">
          <p>We watched teams at fast-growing companies adopt ChatGPT overnight — and watched their security teams scramble to catch up. Existing DLP tools weren&apos;t built for a world where every employee has a direct line to a public AI model.</p>
          <p>Pretzel started as a simple Chrome extension to block PII from leaving the browser. It&apos;s grown into a full policy platform that lets security teams configure, enforce, and audit AI usage across their entire organization.</p>
          <p>We&apos;re mykka.ai — a small team obsessed with making enterprise security tools that people actually install, use, and recommend to peers. We&apos;re funded by customers, not VCs.</p>
        </div>
        <div className="mt-12 rounded-2xl border border-[#7c6aff]/20 bg-[#7c6aff]/[0.06] p-6">
          <p className="text-[14px] font-semibold text-white">Want to talk?</p>
          <p className="mt-1 text-[13px] text-[#94a3b8]">hello@mykka.ai — we read every email and reply to most of them.</p>
        </div>
      </div>
    </div>
  )
}
