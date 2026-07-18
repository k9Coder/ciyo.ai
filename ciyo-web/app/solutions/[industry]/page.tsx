import { notFound } from 'next/navigation'

const INDUSTRIES = {
  healthcare: { title: 'Healthcare policy example', examples: ['Patient identifiers', 'Medical record formats', 'Organization-specific terms'] },
  legal: { title: 'Legal policy example', examples: ['Client names', 'Matter identifiers', 'Confidentiality markers'] },
  fintech: { title: 'Financial policy example', examples: ['Account and card patterns', 'Deal codenames', 'Organization-specific terms'] },
  engineering: { title: 'Engineering policy example', examples: ['High-entropy strings', 'Credential patterns', 'Internal project names'] },
} as const

export function generateStaticParams() {
  return Object.keys(INDUSTRIES).map(industry => ({ industry }))
}

export default async function IndustryPage({ params }: { params: Promise<{ industry: string }> }) {
  const { industry } = await params
  const content = INDUSTRIES[industry as keyof typeof INDUSTRIES]
  if (!content) notFound()
  return (
    <div className="px-6 py-24"><div className="mx-auto max-w-3xl">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Use Case</p>
      <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">{content.title}</h1>
      <p className="mb-10 text-[16px] text-[#94a3b8]">Configure organization-specific rules using current pattern, entropy, dictionary, and score detection. This example is not legal advice or a compliance guarantee.</p>
      <ul className="space-y-3">{content.examples.map(example => <li key={example} className="rounded-xl border border-white/[0.07] bg-[#17171e] p-5 text-[#94a3b8]">{example}</li>)}</ul>
    </div></div>
  )
}
