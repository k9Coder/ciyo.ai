import Link from 'next/link'
import { APP_URL } from '@/lib/config'

export function CTABanner() {
  return (
    <section className="border-t border-white/[0.05] px-6 py-24">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[#7c6aff]/25 bg-gradient-to-br from-[#7c6aff]/10 to-[#17171e] p-14 text-center"
        style={{ boxShadow: '0 0 80px rgba(124,106,255,.1)' }}>
        <h2 className="mb-4 text-4xl font-extrabold tracking-tight text-white">
          Ready to protect your team?
        </h2>
        <p className="mx-auto mb-8 max-w-md text-[15px] text-[#94a3b8]">
          Install Pretzel in 30 seconds. Configure your first policy with AI help.
          See results immediately.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={`${APP_URL}/onboarding`}
            className="rounded-xl bg-[#7c6aff] px-8 py-3 text-[15px] font-bold text-white shadow-lg shadow-[#7c6aff]/25 transition hover:bg-[#6b59ee]">
            Start Free — No Credit Card
          </Link>
          <Link href="mailto:hello@ciyo.ai?subject=Enterprise enquiry"
            className="rounded-xl border border-white/10 bg-white/5 px-8 py-3 text-[15px] font-semibold text-white transition hover:bg-white/10">
            Talk to Sales
          </Link>
        </div>
      </div>
    </section>
  )
}
