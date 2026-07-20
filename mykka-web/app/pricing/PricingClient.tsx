'use client'
import { useState } from 'react'
import Link from 'next/link'
import { APP_URL, IS_PILOT_MODE } from '@/lib/config'

const TIERS = [
  {
    name: 'Solo', monthly: 0, annual: 0, per: 'forever',
    desc: 'For individuals validating Pretzel before recommending it.',
    cta: 'Get Started Free', href: `${APP_URL}/onboarding`, featured: false,
    features: ['3 users', '1 subject, 5 rules', 'Keyword detection only', '500 scans / month', 'Basic Console access'],
    missing: ['Analytics', 'Org hierarchy', 'Entropy/pattern detection', 'AI assistant', 'Alerting'],
  },
  {
    name: 'Starter', monthly: 49, annual: 40, per: '/mo flat',
    desc: 'Small teams. Easy to expense — no per-seat maths.',
    cta: 'Start Free Trial', href: `${APP_URL}/onboarding?plan=starter`, featured: false,
    features: ['25 users', 'Unlimited subjects + rules', 'Keyword + regex detection', '50,000 scans / month', '30-day analytics', 'Basic audit log', 'Email support'],
    missing: ['Entropy detection', 'AI assistant', 'Slack alerting'],
  },
  {
    name: 'Business', monthly: 15, annual: 12, per: '/user/mo',
    desc: 'Full protection for the whole org. Scales with headcount.',
    cta: 'Start Business', href: `${APP_URL}/onboarding?plan=business`, featured: true,
    features: ['Unlimited users', 'All detection types', 'Unlimited scans', '12-month audit log', 'Division & team hierarchy', 'AI policy assistant', 'Slack + email alerting', 'Priority support'],
    missing: [],
  },
  {
    name: 'Enterprise', monthly: null, annual: null, per: '/year',
    desc: 'Custom contract for 500+ seat deployments.',
    cta: 'Talk to Sales', href: 'mailto:sales@mykka.ai', featured: false,
    features: ['Everything in Business', 'SSO / SAML', 'Chrome Enterprise push', 'SIEM integration', 'On-premise policy option', 'Custom data retention + SLAs', 'Dedicated success manager'],
    missing: [],
  },
]

export default function PricingClient() {
  const [annual, setAnnual] = useState(false)

  if (IS_PILOT_MODE) {
    return (
      <div className="px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]">Pilot Program</p>
          <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">
            You&apos;re In
          </h1>
          <p className="mx-auto mb-8 max-w-lg text-[16px] text-[#94a3b8]">
            Pretzel is currently in a closed pilot. All features are available at no cost during the pilot period.
            Pricing will be announced before general availability.
          </p>
          <Link
            href={`${APP_URL}/onboarding`}
            className="inline-block rounded-xl bg-[#5b8cff] px-8 py-3 text-[14px] font-bold text-white hover:bg-[#3f6fe0]"
          >
            Access the Console →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]">Pricing</p>
        <h1 className="mb-4 text-center text-5xl font-extrabold tracking-tight text-white">
          Transparent Pricing
        </h1>
        <p className="mx-auto mb-8 max-w-lg text-center text-[16px] text-[#94a3b8]">
          Start free. Scale when you need it. No surprise invoices.
        </p>

        <div className="mb-12 flex items-center justify-center gap-3">
          <span className={`text-[13px] font-semibold ${!annual ? 'text-white' : 'text-[#64748b]'}`}>Monthly</span>
          <button onClick={() => setAnnual(!annual)}
            className={`relative h-6 w-11 rounded-full transition-colors ${annual ? 'bg-[#5b8cff]' : 'bg-white/10'}`}
            aria-label="Toggle annual pricing">
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <span className={`text-[13px] font-semibold ${annual ? 'text-white' : 'text-[#64748b]'}`}>
            Annual <span className="text-[#34d399]">— save 2 months</span>
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {TIERS.map(({ name, monthly, annual: annualPrice, per, desc, cta, href, featured, features, missing }) => {
            const price = annual ? annualPrice : monthly
            return (
              <div key={name} className={`relative flex flex-col rounded-2xl border p-6 ${featured ? 'border-[#5b8cff] bg-gradient-to-b from-[#5b8cff]/10 to-[#17171e]' : 'border-white/[0.07] bg-[#17171e]'}`}>
                {featured && <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#5b8cff] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Most Popular</span>}
                <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-[#94a3b8]">{name}</p>
                <div className="mb-2">
                  {price === null
                    ? <p className="text-3xl font-extrabold text-white">Custom</p>
                    : <p className="text-3xl font-extrabold text-white">{price === 0 ? 'Free' : `$${price}`}<span className="text-[12px] font-normal text-[#94a3b8]"> {per}</span></p>
                  }
                </div>
                <p className="mb-5 text-[12px] text-[#64748b]">{desc}</p>
                <ul className="mb-5 flex-1 space-y-2">
                  {features.map(f => <li key={f} className="flex gap-2 text-[12px] text-[#94a3b8]"><span className="shrink-0 text-[#34d399]">✓</span>{f}</li>)}
                  {missing.map(f => <li key={f} className="flex gap-2 text-[12px] text-[#4b5563]"><span className="shrink-0">–</span>{f}</li>)}
                </ul>
                <Link href={href} className={`block rounded-xl py-2.5 text-center text-[13px] font-bold transition ${featured ? 'bg-[#5b8cff] text-white hover:bg-[#3f6fe0]' : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'}`}>
                  {cta}
                </Link>
              </div>
            )
          })}
        </div>

        <div className="mt-20">
          <h2 className="mb-8 text-center text-2xl font-bold text-white">Frequently asked questions</h2>
          {[
            ['What counts as a scan?', 'Every time the Pretzel extension evaluates a prompt against your policy rules counts as one scan. Scans are counted when a prompt is submitted, not when the page loads.'],
            ['Can I change plans at any time?', 'Yes. Upgrade instantly from the Console Settings page. Downgrade takes effect at the next billing cycle.'],
            ['What happens when I hit my scan limit?', 'On the free tier, once you reach 500 scans the extension stops scanning new prompts until the next month begins. The Console displays an upgrade prompt. Paid tiers have generous limits — most teams never hit them.'],
            ['Do you store the contents of prompts?', 'Pretzel records which rule fired, which AI site, and which member triggered the event. For rules configured to report matched content, a brief excerpt of the matched text may be retained for audit purposes. Full prompt text is never stored.'],
            ['Is there a free trial on paid tiers?', '14-day free trial on Business. No credit card required to start.'],
          ].map(([q, a]) => (
            <details key={q} className="mb-3 rounded-xl border border-white/[0.07] bg-[#17171e] p-5">
              <summary className="cursor-pointer text-[14px] font-semibold text-white">{q}</summary>
              <p className="mt-3 text-[13px] text-[#94a3b8]">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
