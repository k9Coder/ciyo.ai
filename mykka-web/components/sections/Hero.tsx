import Link from 'next/link'
import { IS_PILOT_MODE } from '@/lib/config'
import { primaryCta, PILOT_TERMS } from '@/lib/cta'
import { HeroDemo } from './HeroDemo'

export function Hero() {
  const cta = primaryCta()
  return (
    <section id="top" className="mx-auto grid max-w-[1200px] items-center gap-14 px-6 pb-16 pt-[72px] lg:grid-cols-2">
      <div className="flex flex-col gap-[22px]">
        <div className="flex items-center gap-2 font-mono text-[13px] text-brand">
          <span className="size-[7px] rounded-full bg-brand" />
          For ChatGPT, Claude and Gemini · browser and desktop
        </div>
        <h1 className="m-0 text-balance text-[clamp(40px,5.4vw,64px)] font-semibold leading-[1.02] tracking-[-0.035em]">
          Let your team use AI. Keep client data out of it.
        </h1>
        <p className="m-0 max-w-[540px] text-pretty text-[19px] leading-[1.5] text-muted">
          Pretzel checks every prompt before it&apos;s sent and catches personal data, passwords and code.
          It offers to remove them, so people can keep working. Detection runs on the device.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Link href={cta.href}
            className="whitespace-nowrap rounded-btn bg-btn px-[22px] py-[13px] text-[16px] font-medium text-btn-fg transition-opacity hover:opacity-90">
            {cta.label}
          </Link>
          <Link href="/product"
            className="whitespace-nowrap rounded-btn bg-fill px-[22px] py-[13px] text-[16px] text-ink">
            See the product
          </Link>
        </div>
        <div className="text-[14px] text-muted">
          {IS_PILOT_MODE ? `Pilot: free, ${PILOT_TERMS}.` : 'No proxy or network changes. No credit card.'}
        </div>
      </div>

      <HeroDemo />
    </section>
  )
}
