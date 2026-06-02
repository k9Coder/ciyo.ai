import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Security & Trust',
  description: 'How Pretzel handles your data — encryption, retention, and compliance.',
}

const POINTS = [
  { icon: '🔒', title: 'Prompt content is never stored', body: 'Pretzel only records the outcome: which rule fired, which site, which user. The actual text of the prompt is never transmitted to our servers or stored anywhere.' },
  { icon: '🔐', title: 'Encryption in transit and at rest', body: 'All API traffic uses TLS 1.3. Data at rest is encrypted with AES-256. Your org token is hashed with bcrypt — we cannot recover it.' },
  { icon: '📋', title: 'SOC 2 Type II — in progress', body: 'We are actively working toward SOC 2 Type II certification. Our security practices are designed to meet those controls now, before the audit.' },
  { icon: '🇪🇺', title: 'GDPR & CCPA ready', body: 'Data is stored in the EU by default. We support data deletion requests within 30 days. We are happy to sign a DPA (Data Processing Agreement) for enterprise customers.' },
  { icon: '🐛', title: 'Responsible disclosure', body: 'Found a vulnerability? Email security@ciyo.ai. We aim to respond within 24 hours and fix within 7 days for critical issues.' },
]

export default function SecurityPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Security & Trust</p>
        <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">How We Handle Your Data</h1>
        <p className="mb-16 text-[16px] text-[#94a3b8]">CISOs ask hard questions. Here are honest answers.</p>
        <div className="space-y-4">
          {POINTS.map(({ icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-7">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-2xl">{icon}</span>
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
