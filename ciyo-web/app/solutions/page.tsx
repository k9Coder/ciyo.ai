import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI Security Solutions by Industry — Healthcare, Legal, Fintech, Engineering',
  description: 'Pre-built AI DLP policy starter kits for regulated industries. Pretzel ships with policy templates for HIPAA, PCI-DSS, attorney-client privilege, and developer credential protection.',
  openGraph: {
    title: 'AI Security Solutions by Industry — Pretzel',
    description: 'Pre-built AI DLP policy starter kits for regulated industries. Healthcare, Legal, Fintech, and Engineering.',
  },
}

const INDUSTRIES = [
  { slug: 'healthcare',  name: 'Healthcare',  icon: '🏥', desc: 'Block PHI and HIPAA-regulated data from reaching AI tools.' },
  { slug: 'legal',       name: 'Legal',       icon: '⚖️', desc: 'Protect attorney-client privilege and confidential matter data.' },
  { slug: 'fintech',     name: 'Fintech',     icon: '💳', desc: 'Block PCI card data, AML triggers, and MNPI from AI prompts.' },
  { slug: 'engineering', name: 'Engineering', icon: '💻', desc: 'Catch credentials, API keys, and proprietary code in AI inputs.' },
]

export default function SolutionsPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Solutions</p>
        <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">By Industry</h1>
        <p className="mx-auto mb-16 max-w-lg text-[16px] text-[#94a3b8]">
          Every industry has different data to protect. Pretzel ships with starter templates for each.
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
