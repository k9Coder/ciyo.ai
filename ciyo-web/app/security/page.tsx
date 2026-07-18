import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Security & Trust',
  description: 'Current, limitation-aware information about Pretzel prompt evaluation and administration.',
}

const POINTS = [
  ['Local evaluation', 'The Chrome extension evaluates prompts locally on supported ChatGPT, Claude, and Gemini hosts.'],
  ['Authentication and policy', 'Users authenticate before receiving organization policy. Administrators configure and publish policy through the Console.'],
  ['Detection limits', 'Pattern, entropy, dictionary, and score rules are best-effort controls. Results depend on rule configuration and supported host behavior.'],
  ['Events and audit', 'The product can report scan events and matched excerpts according to policy configuration. Do not assume prompt content is never recorded or transmitted.'],
  ['Security questions', 'Contact security@ciyo.ai for current operational, infrastructure, or assurance information.'],
]

export default function SecurityPage() {
  return (
    <div className="px-6 py-24"><div className="mx-auto max-w-3xl">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Security &amp; Trust</p>
      <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">Current Product Boundaries</h1>
      <p className="mb-16 text-[16px] text-[#94a3b8]">Claims requiring operational, legal, or third-party evidence are provided only through an approved review process.</p>
      <div className="space-y-4">{POINTS.map(([title, body]) => <section key={title} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-7"><h2 className="mb-3 text-[17px] font-bold text-white">{title}</h2><p className="text-[14px] leading-relaxed text-[#94a3b8]">{body}</p></section>)}</div>
    </div></div>
  )
}
