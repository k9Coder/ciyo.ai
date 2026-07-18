import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Product', description: 'Current Pretzel product capabilities and limits.' }

const SECTIONS = [
  ['Authenticated Chrome extension', 'Pretzel evaluates prompts locally for authenticated users on supported ChatGPT, Claude, and Gemini hosts. Detection is best-effort and host-specific.'],
  ['Local detection and actions', 'Published policy can use pattern, entropy, dictionary, and score detection with configurable warn or block actions.'],
  ['Console administration', 'Administrators manage organization configuration, rules, members, audit data, settings, and policy publishing through the Pretzel Console.'],
]

export default function ProductPage() {
  return (
    <div className="px-6 py-24"><div className="mx-auto max-w-4xl">
      <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Product</p>
      <h1 className="mb-4 text-center text-5xl font-extrabold tracking-tight text-white">Current Pretzel Capabilities</h1>
      <p className="mx-auto mb-16 max-w-xl text-center text-[16px] text-[#94a3b8]">The product does not provide arbitrary-site coverage or a guarantee that configured rules will detect every sensitive value.</p>
      <div className="space-y-4">{SECTIONS.map(([title, body]) => <section key={title} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-7"><h2 className="mb-3 text-xl font-bold text-white">{title}</h2><p className="text-[14px] leading-relaxed text-[#94a3b8]">{body}</p></section>)}</div>
    </div></div>
  )
}
