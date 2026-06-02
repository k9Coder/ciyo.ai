import Link from 'next/link'

const TIERS = [
  { name: 'Solo',     price: 'Free', period: '',           desc: 'For individuals exploring Pretzel.',         cta: 'Get Started Free', href: 'https://app.ciyo.ai/onboarding',               featured: false, features: ['3 users', '500 scans/month', 'Keyword detection', 'Basic Console'] },
  { name: 'Starter',  price: '$49',  period: '/mo',        desc: 'Small teams, flat rate.',                    cta: 'Start Starter',    href: 'https://app.ciyo.ai/onboarding?plan=starter',  featured: false, features: ['25 users', '50K scans/month', 'Keyword + regex', '30-day analytics'] },
  { name: 'Business', price: '$15',  period: '/user/mo',   desc: 'Full protection for your whole org.',        cta: 'Start Business',   href: 'https://app.ciyo.ai/onboarding?plan=business', featured: true,  features: ['Unlimited users', 'All detection types', 'AI policy assistant', 'Slack alerting', '12-month audit log'] },
]

export function PricingPreview() {
  return (
    <section className="border-t border-white/[0.05] px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Pricing</p>
        <h2 className="mb-4 text-center text-4xl font-extrabold tracking-tight text-white">
          Simple, transparent pricing
        </h2>
        <p className="mx-auto mb-12 max-w-md text-center text-[15px] text-[#94a3b8]">
          Start free. Upgrade when your team needs it. No surprise invoices.
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map(({ name, price, period, desc, cta, href, featured, features }) => (
            <div key={name} className={`flex flex-col rounded-2xl border p-7 transition ${featured ? 'border-[#7c6aff] bg-gradient-to-b from-[#7c6aff]/10 to-[#17171e]' : 'border-white/[0.07] bg-[#17171e] hover:border-white/[0.14]'}`}>
              {featured && (
                <span className="-mt-10 mb-5 block w-fit self-center rounded-full bg-[#7c6aff] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Most Popular</span>
              )}
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#94a3b8]">{name}</p>
              <p className="mt-2 mb-1 text-4xl font-extrabold text-white">{price}<span className="text-[14px] font-normal text-[#94a3b8]">{period}</span></p>
              <p className="mb-5 text-[13px] text-[#64748b]">{desc}</p>
              <ul className="mb-6 flex-1 space-y-2">
                {features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-[#94a3b8]">
                    <span className="text-[#34d399]">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href={href} className={`block rounded-xl py-2.5 text-center text-[13px] font-bold transition ${featured ? 'bg-[#7c6aff] text-white hover:bg-[#6b59ee]' : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'}`}>
                {cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center">
          <Link href="/pricing" className="text-[13px] text-[#7c6aff] hover:text-[#a78bfa]">
            See full pricing comparison including Enterprise →
          </Link>
        </p>
      </div>
    </section>
  )
}
