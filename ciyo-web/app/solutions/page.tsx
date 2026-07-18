import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Policy Use Cases', description: 'Examples of policy configuration using current Pretzel detection capabilities.' }
const INDUSTRIES = ['healthcare', 'legal', 'fintech', 'engineering']

export default function SolutionsPage() {
  return (
    <div className="px-6 py-24"><div className="mx-auto max-w-4xl text-center">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Use Cases</p>
      <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">Policy Configuration Examples</h1>
      <p className="mx-auto mb-12 max-w-xl text-[16px] text-[#94a3b8]">These examples are not legal advice, certifications, compliance guarantees, or pre-built product templates.</p>
      <div className="grid gap-4 sm:grid-cols-2">{INDUSTRIES.map(name => <Link key={name} href={`/solutions/${name}`} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-7 text-left capitalize text-white">{name}</Link>)}</div>
    </div></div>
  )
}
