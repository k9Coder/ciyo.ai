import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About ciyo.ai',
  description: 'ciyo.ai builds AI prompt data loss prevention for enterprise security teams. A small, customer-funded team obsessed with making DLP tools people actually use.',
  openGraph: {
    title: 'About ciyo.ai — the team behind Pretzel',
    description: 'ciyo.ai builds AI prompt data loss prevention for enterprise security teams. A small, customer-funded team obsessed with making DLP tools people actually use.',
  },
}

export default function AboutPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-2xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">About</p>
        <h1 className="mb-6 text-5xl font-extrabold tracking-tight text-white">Built for the AI-era by people who lived the problem</h1>
        <div className="space-y-4 text-[15px] leading-relaxed text-[#94a3b8]">
          <p>We watched teams at fast-growing companies adopt ChatGPT overnight — and watched their security teams scramble to catch up. Existing DLP tools weren&apos;t built for a world where every employee has a direct line to a public AI model.</p>
          <p>Pretzel started as a simple Chrome extension to block PII from leaving the browser. It&apos;s grown into a full policy platform that lets security teams configure, enforce, and audit AI usage across their entire organization.</p>
          <p>We&apos;re ciyo.ai — a small team obsessed with making enterprise security tools that people actually install, use, and recommend to peers. We&apos;re funded by customers, not VCs.</p>
        </div>
        <div className="mt-12 rounded-2xl border border-[#7c6aff]/20 bg-[#7c6aff]/[0.06] p-6">
          <p className="text-[14px] font-semibold text-white">Want to talk?</p>
          <p className="mt-1 text-[13px] text-[#94a3b8]">hello@ciyo.ai — we read every email and reply to most of them.</p>
        </div>
      </div>
    </div>
  )
}
