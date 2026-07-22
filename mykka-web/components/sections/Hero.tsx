import Link from 'next/link'
import { APP_URL } from '@/lib/config'

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-24 text-center"
      style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,106,255,.18) 0%, transparent 60%)' }}>

      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#5b8cff]/30 bg-[#5b8cff]/10 px-4 py-1.5 text-[12px] font-semibold text-[#8fb3ff]">
        <span className="size-1.5 rounded-full bg-[#34d399]" style={{ boxShadow: '0 0 6px #34d399' }} />
        Now protecting teams at 200+ companies
      </div>

      <h1 className="mx-auto mb-5 max-w-3xl text-5xl font-extrabold leading-[1.08] tracking-[-0.04em] text-white md:text-6xl">
        Stop Your Team from Leaking{' '}
        <span className="bg-gradient-to-r from-[#8fb3ff] to-[#5b8cff] bg-clip-text text-transparent">
          Secrets to AI
        </span>
      </h1>

      <p className="mx-auto mb-8 max-w-xl text-[17px] leading-relaxed text-[#94a3b8]">
        Pretzel intercepts every ChatGPT, Claude, and Gemini prompt before it&apos;s sent —
        blocking PII, credentials, and IP automatically. Installs in 30 seconds.
      </p>

      <div className="mb-12 flex flex-wrap items-center justify-center gap-3">
        <Link href={`${APP_URL}/onboarding`}
          className="rounded-xl bg-[#5b8cff] px-7 py-3 text-[15px] font-bold text-white shadow-lg shadow-[#5b8cff]/25 transition hover:bg-[#3f6fe0] hover:shadow-[#5b8cff]/40">
          Start Free — No Credit Card
        </Link>
        <Link href="/product"
          className="rounded-xl border border-white/10 bg-white/5 px-7 py-3 text-[15px] font-semibold text-white transition hover:bg-white/10">
          See How It Works →
        </Link>
      </div>

      {/* Browser frame mockup showing Pretzel blocking a ChatGPT prompt */}
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d10] shadow-2xl shadow-black/50"
        aria-label="Pretzel extension blocking a sensitive prompt in ChatGPT">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#111115] px-4 py-3">
          <span className="size-3 rounded-full bg-[#ff5f57]" aria-hidden="true" />
          <span className="size-3 rounded-full bg-[#febc2e]" aria-hidden="true" />
          <span className="size-3 rounded-full bg-[#28c840]" aria-hidden="true" />
          <div className="ml-3 flex-1 rounded-md bg-white/[0.05] px-3 py-1 text-left text-[11px] text-[#64748b]">
            chat.openai.com
          </div>
        </div>
        {/* ChatGPT-style prompt area */}
        <div className="px-6 py-8">
          <div className="mb-4 rounded-xl border border-[#ff4d4d]/30 bg-[#ff4d4d]/[0.06] p-4 text-left">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[#ff4d4d]" aria-hidden="true">⚠</span>
              <span className="text-[13px] font-bold text-[#ff4d4d]">Pretzel blocked this prompt</span>
            </div>
            <p className="mb-3 text-[12px] text-[#94a3b8]">
              Sensitive content detected before submission to ChatGPT:
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-3 py-1.5 text-[11px]">
                <span className="font-mono text-[#ff9f40]">SSN pattern</span>
                <span className="text-[#64748b]">→</span>
                <span className="rounded bg-[#ff4d4d]/20 px-1.5 py-0.5 font-mono text-[#ff4d4d]">•••-••-••••</span>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-3 py-1.5 text-[11px]">
                <span className="font-mono text-[#ff9f40]">Customer email</span>
                <span className="text-[#64748b]">→</span>
                <span className="rounded bg-[#ff4d4d]/20 px-1.5 py-0.5 font-mono text-[#ff4d4d]">j.doe@••••.com</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#17171e] px-4 py-3">
            <div className="flex-1 text-left text-[12px] text-[#4b5563] line-through">
              Summarise this patient record for John Doe (SSN: 123-45-6789, john.doe@acme.com)…
            </div>
            <div className="ml-4 flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#5b8cff]" aria-hidden="true" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5b8cff]">Blocked</span>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-8 text-[12px] text-[#94a3b8]">
        Trusted by security teams at healthcare, legal, and fintech companies
      </p>
    </section>
  )
}
