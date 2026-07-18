const STEPS = [
  { number: '01', title: 'Install and sign in', desc: 'Install the Chrome extension and authenticate to receive your organization policy.', detail: 'Current supported hosts are ChatGPT, Claude, and Gemini.' },
  { number: '02', title: 'Configure and publish', desc: 'Create pattern, entropy, dictionary, and score rules in the Pretzel Console.', detail: 'Administrators review scope and choose warn or block actions before publishing.' },
  { number: '03', title: 'Evaluate locally', desc: 'On supported hosts, the extension evaluates prompts locally against the published policy.', detail: 'Detection is best-effort and depends on authentication, host support, and policy configuration.' },
]

export function HowItWorks() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">How It Works</p>
        <h2 className="mb-4 text-center text-4xl font-extrabold tracking-tight text-white">Configure, publish, and evaluate</h2>
        <p className="mx-auto mb-16 max-w-lg text-center text-[15px] text-[#94a3b8]">The Console manages policy; the authenticated Chrome extension applies it on supported hosts.</p>
        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map(step => (
            <div key={step.number} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-8">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]/60">{step.number}</span>
              <h3 className="mb-2 mt-4 text-[18px] font-bold text-white">{step.title}</h3>
              <p className="mb-3 text-[14px] leading-relaxed text-[#94a3b8]">{step.desc}</p>
              <p className="text-[12px] text-[#64748b]">{step.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
