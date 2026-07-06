import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI DLP Solutions by Industry — Healthcare, Legal, Fintech, Engineering | Pretzel',
  description: 'Pre-built AI data loss prevention policy templates for regulated industries. Pretzel ships with starter kits for HIPAA, attorney-client privilege, PCI-DSS, and developer credential protection.',
  alternates: { canonical: 'https://ciyo.ai/solutions' },
  openGraph: {
    title: 'AI DLP Solutions by Industry — Pretzel',
    description: 'Pre-built AI DLP starter kits for healthcare, legal, fintech, and engineering teams.',
  },
}

const INDUSTRIES = [
  { slug: 'healthcare',  name: 'Healthcare',  icon: '🏥', desc: 'Block PHI and HIPAA-regulated data from reaching AI tools.' },
  { slug: 'legal',       name: 'Legal',       icon: '⚖️', desc: 'Protect attorney-client privilege and confidential matter data.' },
  { slug: 'fintech',     name: 'Fintech',     icon: '💳', desc: 'Block PCI card data, AML triggers, and MNPI from AI prompts.' },
  { slug: 'engineering', name: 'Engineering', icon: '💻', desc: 'Catch credentials, API keys, and proprietary code in AI inputs.' },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  url: 'https://ciyo.ai/solutions',
  name: 'AI DLP Solutions by Industry',
  description: 'Pre-built AI data loss prevention policy templates for healthcare, legal, fintech, and engineering teams.',
  publisher: { '@id': 'https://ciyo.ai/#org' },
  hasPart: INDUSTRIES.map(({ slug, name, desc }) => ({
    '@type': 'WebPage',
    url: `https://ciyo.ai/solutions/${slug}`,
    name: `AI DLP for ${name}`,
    description: desc,
  })),
}

export default function SolutionsPage() {
  return (
    <div className="px-6 py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-4xl text-center">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Solutions</p>
        <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">AI DLP by Industry</h1>
        <p className="mx-auto mb-6 max-w-lg text-[16px] text-[#94a3b8]">
          Every industry has different data to protect. Pretzel ships with policy starter kits for each — activate in one click and adjust to your organization.
        </p>
        <p className="mx-auto mb-16 max-w-2xl text-[14px] text-[#64748b]">
          AI data loss prevention requirements differ significantly by regulatory environment. Healthcare teams need HIPAA PHI blocking. Legal teams need privilege protection. Financial services teams need PCI-DSS and MNPI controls. Engineering teams need entropy-based credential detection. Pretzel&apos;s policy engine supports all of these with team-scoped rules and centralized management.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {INDUSTRIES.map(({ slug, name, icon, desc }) => (
            <Link key={slug} href={`/solutions/${slug}`}
              className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-7 text-left transition hover:border-[#7c6aff]/30 hover:-translate-y-1">
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
