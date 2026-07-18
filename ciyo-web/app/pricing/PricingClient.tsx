import Link from 'next/link'
import { APP_URL } from '@/lib/config'

export default function PricingClient() {
  return (
    <div className="px-6 py-24"><div className="mx-auto max-w-4xl text-center">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Availability</p>
      <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">Current Plans and Billing</h1>
      <p className="mx-auto mb-12 max-w-2xl text-[16px] text-[#94a3b8]">Plan names, prices, limits, payment methods, and commercial terms are not published here until approved against current billing configuration.</p>
      <div className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-10">
        <h2 className="mb-3 text-2xl font-bold text-white">Evaluate current product capabilities</h2>
        <p className="mb-8 text-[14px] text-[#94a3b8]">The current product includes the authenticated Chrome extension on supported hosts and Console administration and publishing.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={`${APP_URL}/onboarding`} className="rounded-xl bg-[#7c6aff] px-7 py-3 text-[14px] font-bold text-white">Open Pretzel Console</Link>
          <Link href="mailto:sales@ciyo.ai" className="rounded-xl border border-white/10 px-7 py-3 text-[14px] font-bold text-white">Request current terms</Link>
        </div>
      </div>
    </div></div>
  )
}
