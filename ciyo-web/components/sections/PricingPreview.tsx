import Link from 'next/link'

export function PricingPreview() {
  return (
    <section className="border-t border-white/[0.05] px-6 py-24">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.07] bg-[#17171e] p-10 text-center">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Access</p>
        <h2 className="mb-4 text-4xl font-extrabold tracking-tight text-white">Review current availability</h2>
        <p className="mx-auto mb-8 max-w-xl text-[15px] text-[#94a3b8]">Commercial terms and feature availability may change. Contact ciyo.ai for current plan and billing information.</p>
        <Link href="/pricing" className="text-[13px] font-semibold text-[#a78bfa] hover:underline">View availability information</Link>
      </div>
    </section>
  )
}
