import Link from 'next/link'
import { APP_URL } from '@/lib/config'

export function CTABanner() {
  return (
    <section className="border-t border-white/[0.05] px-6 py-24">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[#7c6aff]/25 bg-[#17171e] p-14 text-center">
        <h2 className="mb-4 text-4xl font-extrabold tracking-tight text-white">Evaluate Pretzel for your supported workflows</h2>
        <p className="mx-auto mb-8 max-w-md text-[15px] text-[#94a3b8]">Use the Console to configure and publish policy, then sign in to the Chrome extension on a supported host.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={`${APP_URL}/onboarding`} className="rounded-xl bg-[#7c6aff] px-8 py-3 text-[15px] font-bold text-white">Open Pretzel Console</Link>
          <Link href="mailto:hello@ciyo.ai" className="rounded-xl border border-white/10 bg-white/5 px-8 py-3 text-[15px] font-semibold text-white">Contact ciyo.ai</Link>
        </div>
      </div>
    </section>
  )
}
