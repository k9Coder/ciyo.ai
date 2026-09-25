import Link from 'next/link'
import { APP_URL, IS_PILOT_MODE } from '@/lib/config'
import { H2 } from './H2'

const TIERS = [
  { name: 'Solo',     price: 'Free', period: '',           desc: 'For individuals exploring Pretzel.',         cta: 'Get Started Free', href: `${APP_URL}/onboarding`,               featured: false, features: ['3 users', '500 scans/month', 'Keyword detection', 'Basic Console'] },
  { name: 'Starter',  price: '$49',  period: '/mo',        desc: 'Small teams, flat rate.',                    cta: 'Start Starter',    href: `${APP_URL}/onboarding?plan=starter`,  featured: false, features: ['25 users', '50K scans/month', 'Keyword + regex', '30-day analytics'] },
  { name: 'Business', price: '$15',  period: '/user/mo',   desc: 'Full protection for your whole org.',        cta: 'Start Business',   href: `${APP_URL}/onboarding?plan=business`, featured: true,  features: ['Unlimited users', 'All detection types', 'AI policy assistant', 'Slack alerting', '12-month audit log'] },
]

export function PricingPreview() {
  if (IS_PILOT_MODE) {
    return (
      <section id="pricing" className="border-y border-line bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-24">
          <p className="m-0 font-mono text-[13px] text-brand">Early access</p>
          <H2>Free during early access</H2>
          <p className="m-0 max-w-[560px] text-[17px] leading-[1.55] text-muted">
            Pretzel is in early access. All features are free while we learn from real teams.
            Pricing will be announced with notice before anything changes.
          </p>
          <div>
            <Link
              href={`${APP_URL}/onboarding`}
              className="inline-block whitespace-nowrap rounded-btn bg-btn px-[22px] py-[13px] text-[16px] font-medium text-btn-fg transition-opacity hover:opacity-90"
            >
              Get started free
            </Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="pricing" className="border-y border-line bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-6 py-24">
        <H2>Pricing</H2>

        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map(({ name, price, period, desc, cta, href, featured, features }) => (
            <div key={name}
              className={`flex flex-col gap-3.5 rounded-token border bg-bg p-[26px] ${featured ? 'border-brand' : 'border-line'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[18px] font-semibold">{name}</span>
                {featured && <span className="text-[13px] text-brand">Most popular</span>}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[40px] font-semibold tracking-[-0.03em]">{price}</span>
                <span className="text-[15px] text-muted">{period}</span>
              </div>
              <span className="text-[15px] text-muted">{desc}</span>
              <ul className="m-0 flex flex-1 list-none flex-col gap-[7px] border-t border-line p-0 pt-3.5">
                {features.map(f => <li key={f} className="text-[15px]">{f}</li>)}
              </ul>
              <Link href={href}
                className={`rounded-btn p-[11px] text-center text-[15px] font-medium ${featured ? 'bg-btn text-btn-fg' : 'bg-fill text-ink'}`}>
                {cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="m-0">
          <Link href="/pricing" className="text-[15px] text-brand hover:text-ink">
            See full pricing comparison including Enterprise →
          </Link>
        </p>
      </div>
    </section>
  )
}
