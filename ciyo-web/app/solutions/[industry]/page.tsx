import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { APP_URL } from '@/lib/config'

const INDUSTRIES = {
  healthcare: {
    name: 'Healthcare',
    headline: 'HIPAA-compliant AI usage for clinical and ops teams',
    problem: 'Healthcare employees use ChatGPT to draft patient communications, summarize clinical notes, and research treatments. Without guardrails, PHI — names, DOBs, diagnoses — ends up in AI training data.',
    solution: 'Pretzel blocks 18 HIPAA-defined PHI identifiers from reaching any AI tool. Activate the Healthcare policy starter kit and your team is covered in minutes.',
    rules: ['Patient name + date-of-birth patterns', 'Diagnosis and ICD-10 code detection', 'Insurance member ID patterns', 'Medical record number formats'],
    stat: { num: '94%', label: 'of healthcare organizations reported at least one AI-related data concern in 2025', source: 'American Medical Association AI Survey, 2025' },
    cta: 'Read the HIPAA AI Policy Guide',
    ctaHref: '/blog/hipaa-ai-policy-template',
  },
  legal: {
    name: 'Legal',
    headline: 'Protect attorney-client privilege in the age of AI',
    problem: 'Associates use AI to draft contracts, research case law, and summarize depositions. Pasting privileged communications into a public AI service can waive attorney-client privilege.',
    solution: 'Pretzel blocks client names, matter numbers, and privileged document keywords. Scope rules to the legal team only so the rest of the org is unaffected.',
    rules: ['Client name and matter number detection', 'Document classification markers', 'Deposition and filing keywords', 'Court-confidential pattern detection'],
    stat: { num: '67%', label: 'of Am Law 200 firms lacked a formal AI usage policy as of early 2026', source: 'Thomson Reuters Legal AI Report, 2026' },
    cta: 'Read the Legal AI Usage Policy Guide',
    ctaHref: '/blog/legal-ai-usage-policy',
  },
  fintech: {
    name: 'Fintech',
    headline: 'Keep PCI, AML, and trading data out of AI tools',
    problem: 'Finance teams use AI to analyze transactions, draft reports, and model portfolios. Card numbers, account details, and non-public financial information must never reach a third-party AI.',
    solution: "Pretzel's fintech starter kit covers PCI-DSS card patterns, AML watchlist keywords, and MNPI detection. Block or warn based on risk level per team.",
    rules: ['Luhn-validated credit card patterns', 'IBAN and account number formats', 'Insider trading trigger phrases', 'AML flag terms'],
    stat: { num: '$4.5B', label: 'in global financial regulatory fines tied to information security failures in 2025', source: 'BCG Financial Regulatory Fines Report, 2025' },
    cta: 'Read the Fintech AI Risk Guide',
    ctaHref: '/blog/fintech-ai-risk-template',
  },
  engineering: {
    name: 'Engineering',
    headline: 'Stop IP and credentials from leaving your codebase',
    problem: 'Developers paste production configs, API keys, connection strings, and proprietary algorithms into AI coding assistants every day. This is the single most common Pretzel use case.',
    solution: "Pretzel's entropy detection catches API keys and tokens even if they're not in your keyword list. Keyword rules catch specific internal project names, client names, and database schemas.",
    rules: ['High-entropy string detection (API keys, tokens)', 'AWS/GCP/Azure key pattern matching', 'Database connection string patterns', 'Internal project name blocklist'],
    stat: { num: '1 in 3', label: 'developer AI prompts contain at least one credential or secret', source: 'ciyo.ai platform data, 2026 — based on aggregate analysis of anonymised scan events across Pretzel business customers' },
    cta: 'Read the Engineering AI Security Guide',
    ctaHref: '/blog/engineering-ai-security-starter',
  },
} as const

type Industry = keyof typeof INDUSTRIES

export function generateStaticParams() {
  return Object.keys(INDUSTRIES).map(industry => ({ industry }))
}

const INDUSTRY_META: Record<string, { title: string; description: string }> = {
  healthcare: {
    title: 'AI DLP for Healthcare — HIPAA Compliance for ChatGPT | Pretzel',
    description: 'Prevent patient PHI from reaching ChatGPT, Claude, and Gemini. Pretzel blocks all 18 HIPAA-defined PHI identifiers at the point of input. No network changes required.',
  },
  legal: {
    title: 'AI DLP for Legal Teams — Protect Attorney-Client Privilege | Pretzel',
    description: 'Stop privileged communications, client names, and matter details from reaching AI tools. Pretzel enforces attorney-client privilege protection at the browser level.',
  },
  fintech: {
    title: 'AI DLP for Fintech — Keep Card Data and MNPI Out of AI Tools | Pretzel',
    description: 'Block PCI-DSS card numbers, IBAN codes, and material non-public information from reaching AI chat interfaces. Audit trail included for regulatory compliance.',
  },
  engineering: {
    title: 'AI DLP for Engineering — Stop Credentials and Code Leaking to AI | Pretzel',
    description: 'Entropy detection catches API keys, tokens, and database passwords before they reach ChatGPT or Copilot — even credentials not in your keyword list.',
  },
}

export function generateMetadata({ params }: { params: Promise<{ industry: string }> }): Promise<Metadata> {
  return params.then(({ industry }) => {
    const data = INDUSTRIES[industry as Industry]
    if (!data) return {}
    const meta = INDUSTRY_META[industry]
    const title = meta?.title ?? `${data.name} AI Security — Pretzel`
    const description = meta?.description ?? `${data.headline}. ${data.problem.slice(0, 120)}…`
    return {
      title,
      description,
      alternates: { canonical: `https://ciyo.ai/solutions/${industry}` },
      openGraph: { title, description },
    }
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
          <p className="mt-1.5 text-[11px] text-[#64748b]">Source: {data.stat.source}</p>
        </div>

        <h2 className="mb-3 text-xl font-bold text-white">The Problem</h2>
        <p className="mb-10 text-[15px] leading-relaxed text-[#94a3b8]">{data.problem}</p>

        <h2 className="mb-3 text-xl font-bold text-white">How Pretzel Helps</h2>
        <p className="mb-6 text-[15px] leading-relaxed text-[#94a3b8]">{data.solution}</p>

        <ul className="mb-12 space-y-3">
          {data.rules.map(r => (
            <li key={r} className="flex items-center gap-3 text-[14px] text-[#94a3b8]">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#34d399]/10 text-[12px] text-[#34d399]" aria-hidden="true">✓</span>
              {r}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-3">
          <Link href={`${APP_URL}/onboarding`}
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
