import Link from 'next/link'
import { APP_URL } from '@/lib/config'

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-24 text-center"
      style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,106,255,.18) 0%, transparent 60%)' }}>

      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#7c6aff]/30 bg-[#7c6aff]/10 px-4 py-1.5 text-[12px] font-semibold text-[#a78bfa]">
        <span className="size-1.5 rounded-full bg-[#34d399]" style={{ boxShadow: '0 0 6px #34d399' }} />
        Now protecting teams at 200+ companies
      </div>

      <h1 className="mx-auto mb-5 max-w-3xl text-5xl font-extrabold leading-[1.08] tracking-[-0.04em] text-white md:text-6xl">
        Stop Your Team from Leaking{' '}
        <span className="bg-gradient-to-r from-[#a78bfa] to-[#7c6aff] bg-clip-text text-transparent">
          Secrets to AI
        </span>
      </h1>

      <p className="mx-auto mb-8 max-w-xl text-[17px] leading-relaxed text-[#94a3b8]">
        Pretzel intercepts every ChatGPT, Claude, and Gemini prompt before it&apos;s sent —
        blocking PII, credentials, and IP automatically. Installs in 30 seconds.
      </p>

      <div className="mb-12 flex flex-wrap items-center justify-center gap-3">
        <Link href={`${APP_URL}/onboarding`}
          className="rounded-xl bg-[#7c6aff] px-7 py-3 text-[15px] font-bold text-white shadow-lg shadow-[#7c6aff]/25 transition hover:bg-[#6b59ee] hover:shadow-[#7c6aff]/40">
          Start Free — No Credit Card
        </Link>
        <Link href="/product"
          className="rounded-xl border border-white/10 bg-white/5 px-7 py-3 text-[15px] font-semibold text-white transition hover:bg-white/10">
          See How It Works →
        </Link>
      </div>

      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#17171e] shadow-2xl shadow-black/50"
        style={{ aspectRatio: '16/10' }}>
        <div className="flex h-full items-center justify-center">
          <p className="text-[13px] text-[#64748b]">Extension screenshot placeholder</p>
        </div>
      </div>

      <p className="mt-8 text-[12px] text-[#64748b]">
        Trusted by security teams at healthcare, legal, and fintech companies
      </p>
    </section>
  )
}
