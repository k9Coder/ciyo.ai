import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About ciyo.ai',
  description: 'ciyo.ai builds Pretzel, a Chrome extension and administration console for AI prompt policy.',
}

export default function AboutPage() {
  return (
    <div className="px-6 py-24"><div className="mx-auto max-w-2xl">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">About</p>
      <h1 className="mb-6 text-5xl font-extrabold tracking-tight text-white">The team building Pretzel</h1>
      <div className="space-y-4 text-[15px] leading-relaxed text-[#94a3b8]">
        <p>Pretzel combines an authenticated Chrome extension on supported AI hosts with a Console for policy administration and publishing.</p>
        <p>Contact ciyo.ai at hello@ciyo.ai for product, company, or availability questions.</p>
      </div>
    </div></div>
  )
}
