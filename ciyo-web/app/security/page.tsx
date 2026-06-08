import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Security & Trust',
  description: 'Pretzel never stores prompt content in full. TLS 1.3, AES-256, EU data residency, SOC 2 Type II in progress. Honest answers to the questions CISOs actually ask.',
}

const POINTS = [
  {
    icon: '🔒',
    title: 'Prompt content is never stored in full',
    body: 'Pretzel records which rule fired, which AI site, and which member triggered the event. For rules configured to report matched content, a brief excerpt of the matched text may be retained for audit purposes and is deleted on a rolling 90-day window. The full text of any prompt is never transmitted to or stored on our servers.',
  },
  {
    icon: '🔐',
    title: 'Encryption in transit and at rest',
    body: 'All API traffic uses TLS 1.3. Data at rest is encrypted with AES-256. Your org token is hashed with bcrypt — we cannot recover it.',
  },
  {
    icon: '📋',
    title: 'SOC 2 Type II — in progress',
    body: 'We are actively working toward SOC 2 Type II certification, targeted for Q3 2026. Our security practices are designed to meet those controls now, before the audit. Interim controls documentation is available on request — contact security@ciyo.ai.',
  },
  {
    icon: '🇪🇺',
    title: 'GDPR & CCPA aligned by design',
    body: 'Data is stored in the EU by default (AWS eu-west-1, Frankfurt region). We are designed for GDPR and CCPA compliance. We are happy to sign a Data Processing Agreement (DPA) for enterprise customers — request one at privacy@ciyo.ai.',
  },
  {
    icon: '🐛',
    title: 'Responsible disclosure',
    body: 'Found a vulnerability? Email security@ciyo.ai. We aim to respond within 24 hours and fix within 7 days for critical issues. A formal bug bounty program is on our roadmap.',
  },
]

export default function SecurityPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Security &amp; Trust</p>
        <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">How We Handle Your Data</h1>
        <p className="mb-16 text-[16px] text-[#94a3b8]">CISOs ask hard questions. Here are honest answers.</p>
        <div className="space-y-4">
          {POINTS.map(({ icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-7">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-2xl" aria-hidden="true">{icon}</span>
                <h2 className="text-[17px] font-bold text-white">{title}</h2>
              </div>
              <p className="text-[14px] leading-relaxed text-[#94a3b8]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
