import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI DLP Solutions by Industry — Healthcare, Legal, Fintech, Engineering',
  description: 'Starter policy templates plus a full custom rule engine and AI assistant, for healthcare, legal, fintech, and engineering teams. Activate a template in minutes, then configure exactly what to catch.',
  alternates: { canonical: 'https://mykka.ai/solutions' },
  openGraph: {
    title: 'AI DLP Solutions by Industry — Pretzel',
    description: 'Starter policy templates plus a custom rule engine and AI assistant, for healthcare, legal, fintech, and engineering teams.',
  },
}

const INDUSTRIES = [
  { slug: 'healthcare',  name: 'Healthcare',  icon: '🏥', desc: 'Start from a PHI-detection template, then configure exactly what to catch.' },
  { slug: 'legal',       name: 'Legal',       icon: '⚖️', desc: 'Detect attorney-client privilege markers by default, then configure matter-specific protection.' },
  { slug: 'fintech',     name: 'Fintech',     icon: '💳', desc: 'Detect card numbers by default; configure AML and MNPI protection yourself.' },
  { slug: 'engineering', name: 'Engineering', icon: '💻', desc: 'Catch credentials, API keys, and proprietary code in AI inputs.' },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  url: 'https://mykka.ai/solutions',
  name: 'AI DLP Solutions by Industry',
  description: 'Starter policy templates plus a custom rule engine and AI assistant, for healthcare, legal, fintech, and engineering teams.',
  publisher: { '@id': 'https://mykka.ai/#org', '@type': 'Organization', name: 'mykka.ai', url: 'https://mykka.ai' },
  hasPart: INDUSTRIES.map(({ slug, name, desc }) => ({
    '@type': 'WebPage',
    url: `https://mykka.ai/solutions/${slug}`,
    name: `AI DLP for ${name}`,
    description: desc,
  })),
}

export default function SolutionsPage() {
  return (
    <div className="px-6 py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-4xl text-center">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]">Solutions</p>
        <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">AI DLP by Industry</h1>
        <p className="mx-auto mb-6 max-w-lg text-[16px] text-[#94a3b8]">
          Every industry has different data to protect. Pretzel ships with starter templates for each — activate in one click, then configure exactly what to catch.
        </p>
        <p className="mx-auto mb-16 max-w-2xl text-[14px] text-[#64748b]">
          AI data loss prevention requirements differ significantly by regulatory environment. Healthcare teams need PHI detection. Legal teams need privilege protection. Financial services teams need card-data and MNPI controls. Engineering teams need entropy-based credential detection. Pretzel&apos;s policy engine covers all of these through custom keyword, pattern, and entropy rules — describe what you need to the Console AI assistant, or write the rules yourself, then scope them by team.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {INDUSTRIES.map(({ slug, name, icon, desc }) => (
            <Link key={slug} href={`/solutions/${slug}`}
              className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-7 text-left transition hover:border-[#5b8cff]/30 hover:-translate-y-1">
              <span className="mb-3 block text-3xl">{icon}</span>
              <h2 className="mb-2 text-[18px] font-bold text-white">{name}</h2>
              <p className="text-[13px] text-[#94a3b8]">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
