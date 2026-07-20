const STEPS = [
  {
    number: '01', icon: '🧩', title: 'Install Pretzel',
    desc: 'Add the Chrome extension from the Web Store. Takes 30 seconds. No IT ticket, no proxy, no agent install.',
    detail: 'Works on ChatGPT, Claude, Gemini, and any other AI site your team uses.',
  },
  {
    number: '02', icon: '⚙️', title: 'Configure Your Policy',
    desc: 'Tell Pretzel what to protect — customer PII, source code, financial data, credentials. Use a one-click industry template or build your own.',
    detail: 'Our AI assistant helps you create rules in plain English. No regex knowledge required.',
  },
  {
    number: '03', icon: '🛡️', title: 'Your Team Is Protected',
    desc: 'Pretzel watches every AI prompt automatically. Sensitive content is blocked or flagged before it leaves the browser.',
    detail: 'Admins get real-time Slack alerts. Your compliance team gets an audit trail.',
  },
]

export function HowItWorks() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]">How It Works</p>
        <h2 className="mb-4 text-center text-4xl font-extrabold tracking-tight text-white">
          From zero to protected in 30 minutes
        </h2>
        <p className="mx-auto mb-16 max-w-lg text-center text-[15px] text-[#94a3b8]">
          No enterprise procurement. No network changes. No IT involvement required for the first install.
        </p>

        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map(({ number, icon, title, desc, detail }) => (
            <div key={number} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-8 transition hover:border-[#5b8cff]/30">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#5b8cff]/15 text-xl">{icon}</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]/60">{number}</span>
              </div>
              <h3 className="mb-2 text-[18px] font-bold text-white">{title}</h3>
              <p className="mb-3 text-[14px] leading-relaxed text-[#94a3b8]">{desc}</p>
              <p className="text-[12px] text-[#64748b]">{detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
