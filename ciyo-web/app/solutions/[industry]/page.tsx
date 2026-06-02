import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

const INDUSTRIES = {
  healthcare: {
    name: 'Healthcare',
    headline: 'HIPAA-compliant AI usage for clinical and ops teams',
    problem: 'Healthcare employees use ChatGPT to draft patient communications, summarize clinical notes, and research treatments. Without guardrails, PHI — names, DOBs, diagnoses — ends up in AI training data.',
    solution: 'Pretzel blocks 18 HIPAA-defined PHI identifiers from reaching any AI tool. One-click activate the Healthcare policy template and your team is covered in minutes.',
    rules: ['Patient name + date-of-birth patterns', 'Diagnosis and ICD-10 code detection', 'Insurance member ID patterns', 'Medical record number formats'],
    stat: { num: '94%', label: 'of healthcare orgs had at least one AI-related data concern in 2025' },
    cta: 'Download Free HIPAA AI Policy Template',
    ctaHref: '/blog/hipaa-ai-policy-template',
  },
  legal: {
    name: 'Legal',
    headline: 'Protect attorney-client privilege in the age of AI',
    problem: 'Associates use AI to draft contracts, research case law, and summarize depositions. Pasting privileged communications into a public AI service can waive attorney-client privilege.',
    solution: 'Pretzel blocks client names, matter numbers, and privileged document keywords. Scope rules to the legal team only so the rest of the org is unaffected.',
    rules: ['Client name and matter number detection', 'Document classification markers', 'Deposition and filing keywords', 'Court-confidential pattern detection'],
    stat: { num: '67%', label: 'of Am Law 200 firms have no AI usage policy as of 2026' },
    cta: 'Download Free Legal AI Usage Policy',
    ctaHref: '/blog/legal-ai-usage-policy',
  },
  fintech: {
    name: 'Fintech',
    headline: 'Keep PCI, AML, and trading data out of AI tools',
    problem: 'Finance teams use AI to analyze transactions, draft reports, and model portfolios. Card numbers, account details, and non-public financial information must never reach a third-party AI.',
    solution: "Pretzel's fintech template covers PCI-DSS card patterns, AML watchlist keywords, and MNPI detection. Block or warn based on risk level per team.",
    rules: ['Luhn-validated credit card patterns', 'IBAN and account number formats', 'Insider trading trigger phrases', 'AML flag terms'],
    stat: { num: '$4.5B', label: 'in financial regulatory fines tied to information security failures in 2025' },
    cta: 'Download Free Fintech AI Risk Template',
    ctaHref: '/blog/fintech-ai-risk-template',
  },
  engineering: {
    name: 'Engineering',
    headline: 'Stop IP and credentials from leaving your codebase',
    problem: 'Developers paste production configs, API keys, connection strings, and proprietary algorithms into AI coding assistants every day. This is the single most common Pretzel use case.',
    solution: "Pretzel's entropy detection catches API keys and tokens even if they're not in your keyword list. Keyword rules catch specific internal project names, client names, and database schemas.",
    rules: ['High-entropy string detection (API keys, tokens)', 'AWS/GCP/Azure key pattern matching', 'Database connection string patterns', 'Internal project name blocklist'],
    stat: { num: '1 in 3', label: 'developer AI prompts contain at least one credential or secret (ciyo.ai data, 2026)' },
    cta: 'Download Free Engineering AI Security Starter',
    ctaHref: '/blog/engineering-ai-security-starter',
  },
} as const

type Industry = keyof typeof INDUSTRIES

export function generateStaticParams() {
  return Object.keys(INDUSTRIES).map(industry => ({ industry }))
}

export function generateMetadata({ params }: { params: Promise<{ industry: string }> }): Promise<Metadata> {
  return params.then(({ industry }) => {
    const data = INDUSTRIES[industry as Industry]
    if (!data) return {}
    return { title: `${data.name} — Pretzel AI Security`, description: data.headline }
  })
}

export default async function SolutionPage({ params }: { params: Promise<{ industry: string }> }) {
  const { industry } = await params
  const data = INDUSTRIES[industry as Industry]
  if (!data) notFound()

  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <Link href="/solutions" className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-[#94a3b8] hover:text-white">
          ← All solutions
        </Link>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">{data.name}</p>
        <h1 className="mb-5 text-5xl font-extrabold tracking-tight text-white">{data.headline}</h1>

        <div className="mb-12 rounded-2xl border border-[#7c6aff]/20 bg-[#7c6aff]/[0.06] p-6 text-center">
          <span className="text-4xl font-extrabold text-white">{data.stat.num}</span>
          <p className="mt-1 text-[13px] text-[#94a3b8]">{data.stat.label}</p>
        </div>

        <h2 className="mb-3 text-xl font-bold text-white">The Problem</h2>
        <p className="mb-10 text-[15px] leading-relaxed text-[#94a3b8]">{data.problem}</p>

        <h2 className="mb-3 text-xl font-bold text-white">How Pretzel Helps</h2>
        <p className="mb-6 text-[15px] leading-relaxed text-[#94a3b8]">{data.solution}</p>

        <ul className="mb-12 space-y-3">
          {data.rules.map(r => (
            <li key={r} className="flex items-center gap-3 text-[14px] text-[#94a3b8]">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#34d399]/10 text-[12px] text-[#34d399]">✓</span>
              {r}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-3">
          <Link href="https://app.ciyo.ai/onboarding"
            className="rounded-xl bg-[#7c6aff] px-7 py-3 text-[14px] font-bold text-white transition hover:bg-[#6b59ee]">
            Start Free — Pre-built {data.name} Template Included
          </Link>
          <Link href={data.ctaHref}
            className="rounded-xl border border-white/10 bg-white/5 px-7 py-3 text-[14px] font-semibold text-white transition hover:bg-white/10">
            {data.cta} →
          </Link>
        </div>
      </div>
    </div>
  )
}
