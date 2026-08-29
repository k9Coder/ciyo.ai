import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { APP_URL } from '@/lib/config'

const INDUSTRIES = {
  healthcare: {
    name: 'Healthcare',
    headline: 'Configurable PHI protection for clinical and ops teams',
    problem: 'Healthcare employees use ChatGPT to draft patient communications, summarize clinical notes, and research treatments. Without guardrails, PHI — names, DOBs, diagnoses — ends up in AI training data.',
    solution: "Pretzel's Healthcare starter template detects SSNs and common PHI keywords (patient name, date of birth, medical record, diagnosis) out of the box. Extend it to any PHI category with custom keyword, pattern, or entropy rules — or describe what to catch in plain English to the Pretzel Console AI assistant, which proposes ready-to-approve rules for you to review.",
    rules: ['Starter template: SSN detection + PHI keywords, active in minutes', 'Extend to any PHI category with custom keyword, pattern, or entropy rules', 'AI assistant turns a plain-English request into a ready-to-approve rule', 'Rules scoped to your team or org-wide'],
    stat: { num: '94%', label: 'of healthcare organizations reported at least one AI-related data concern in 2025', source: 'American Medical Association AI Survey, 2025' },
    cta: 'Read the HIPAA AI Policy Guide',
    ctaHref: '/blog/hipaa-ai-policy-template',
  },
  legal: {
    name: 'Legal',
    headline: 'Protect attorney-client privilege in the age of AI',
    problem: 'Associates use AI to draft contracts, research case law, and summarize depositions. Pasting privileged communications into a public AI service can waive attorney-client privilege.',
    solution: "Pretzel's Legal starter template detects attorney-client privilege markers and SSNs out of the box. Add client-name, matter-number, or filing-keyword detection as custom rules — describe them to the Console AI assistant and approve what it proposes, or write the rules yourself.",
    rules: ['Starter template: privilege markers + SSN detection, active in minutes', 'Add client-name or matter-number detection as custom rules', 'AI assistant turns a plain-English request into a ready-to-approve rule', 'Scope rules to the legal team only'],
    stat: { num: '67%', label: 'of Am Law 200 firms lacked a formal AI usage policy as of early 2026', source: 'Thomson Reuters Legal AI Report, 2026' },
    cta: 'Read the Legal AI Usage Policy Guide',
    ctaHref: '/blog/legal-ai-usage-policy',
  },
  fintech: {
    name: 'Fintech',
    headline: 'Configure PCI, AML, and trading-data protection in Pretzel',
    problem: 'Finance teams use AI to analyze transactions, draft reports, and model portfolios. Card numbers, account details, and non-public financial information must never reach a third-party AI.',
    solution: "Pretzel detects Luhn-validated credit card numbers out of the box, for every user. IBAN formats, MNPI language, and AML terms aren't pre-built — define them as custom rules, or describe what to catch to the Console AI assistant and approve the rules it proposes.",
    rules: ['Luhn-validated credit card detection — on by default', 'IBAN, account-number, or MNPI patterns as custom rules', 'AI assistant turns "flag insider-trading language" into a ready-to-approve rule', 'Block or warn per team'],
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
    stat: { num: '16+', label: 'named credential and API key formats detected out of the box — plus entropy detection for anything else', source: 'Pretzel baseline detection policy' },
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
    title: 'AI DLP for Healthcare Teams — Configurable PHI Protection',
    description: 'Detect SSNs and common PHI keywords out of the box, then extend coverage with custom rules or the Pretzel Console AI assistant. Built for clinical and healthcare ops teams.',
  },
  legal: {
    title: 'AI DLP for Legal Teams — Protect Attorney-Client Privilege',
    description: 'Detect attorney-client privilege markers and SSNs out of the box. Add client names, matter numbers, and filing keywords as custom rules, with the Console AI assistant proposing them for your review.',
  },
  fintech: {
    title: 'AI DLP for Fintech Teams — Card Data Detection, Fully Configurable',
    description: 'Luhn-validated credit card detection is on by default. Configure IBAN, MNPI, and AML detection as custom rules, or let the Pretzel Console AI assistant propose them for your review.',
  },
  engineering: {
    title: 'AI DLP for Engineering — Stop Credentials and Code Leaking to AI',
    description: 'Entropy detection catches API keys, tokens, and database passwords before they reach ChatGPT or Copilot — even credentials not in your keyword list.',
  },
}

export function generateMetadata({ params }: { params: Promise<{ industry: string }> }): Promise<Metadata> {
  return params.then(({ industry }) => {
    const data = INDUSTRIES[industry as Industry]
    if (!data) return {}
    const meta = INDUSTRY_META[industry]
    const title = meta?.title ?? `${data.name} AI Security`
    const description = meta?.description ?? `${data.headline}. ${data.problem.slice(0, 120)}…`
    return {
      title,
      description,
      alternates: { canonical: `https://mykka.ai/solutions/${industry}` },
      openGraph: { title, description },
    }
  })
}

export default async function SolutionPage({ params }: { params: Promise<{ industry: string }> }) {
  const { industry } = await params
  const data = INDUSTRIES[industry as Industry]
  if (!data) notFound()

  const pageUrl = `https://mykka.ai/solutions/${industry}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        name: `AI DLP for ${data.name}`,
        serviceType: 'AI Data Loss Prevention',
        description: data.solution,
        provider: { '@id': 'https://mykka.ai/#org', '@type': 'Organization', name: 'mykka.ai', url: 'https://mykka.ai' },
        areaServed: 'Worldwide',
        audience: { '@type': 'Audience', audienceType: `${data.name} organizations` },
        url: pageUrl,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mykka.ai/' },
          { '@type': 'ListItem', position: 2, name: 'Solutions', item: 'https://mykka.ai/solutions' },
          { '@type': 'ListItem', position: 3, name: data.name, item: pageUrl },
        ],
      },
    ],
  }

  return (
    <div className="px-6 py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-4xl">
        <Link href="/solutions" className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-[#94a3b8] hover:text-white">
          ← All solutions
        </Link>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]">{data.name}</p>
        <h1 className="mb-5 text-5xl font-extrabold tracking-tight text-white">{data.headline}</h1>

        <div className="mb-12 rounded-2xl border border-[#5b8cff]/20 bg-[#5b8cff]/[0.06] p-6 text-center">
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
            className="rounded-xl bg-[#5b8cff] px-7 py-3 text-[14px] font-bold text-white transition hover:bg-[#3f6fe0]">
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
