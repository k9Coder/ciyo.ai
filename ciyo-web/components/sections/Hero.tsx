import Link from 'next/link'
import { APP_URL } from '@/lib/config'

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-24 text-center" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,106,255,.18) 0%, transparent 60%)' }}>
      <div className="mb-5 inline-flex rounded-full border border-[#7c6aff]/30 bg-[#7c6aff]/10 px-4 py-1.5 text-[12px] font-semibold text-[#a78bfa]">Chrome extension for supported AI hosts</div>
      <h1 className="mx-auto mb-5 max-w-3xl text-5xl font-extrabold leading-[1.08] tracking-[-0.04em] text-white md:text-6xl">
        Apply prompt policy before submission
      </h1>
      <p className="mx-auto mb-8 max-w-xl text-[17px] leading-relaxed text-[#94a3b8]">
        Pretzel evaluates prompts locally for authenticated users on supported ChatGPT, Claude, and Gemini hosts. Configure pattern, entropy, dictionary, and score detection with warn or block actions.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href={`${APP_URL}/onboarding`} className="rounded-xl bg-[#7c6aff] px-7 py-3 text-[15px] font-bold text-white">Open Pretzel Console</Link>
        <Link href="/product" className="rounded-xl border border-white/10 bg-white/5 px-7 py-3 text-[15px] font-semibold text-white">See current capabilities</Link>
      </div>
    </section>
  )
}
