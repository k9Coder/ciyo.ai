import Link from 'next/link'
import { IS_PILOT_MODE } from '@/lib/config'
import { primaryCta, PILOT_TERMS } from '@/lib/cta'

export function CTABanner() {
  const cta = primaryCta()
  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-7 rounded-[calc(var(--r)+6px)] bg-fill px-8 py-14 md:px-12">
        <div className="flex max-w-[620px] flex-col gap-3">
          <h2 className="m-0 text-[clamp(28px,3.2vw,40px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            {IS_PILOT_MODE ? "Join the pilot. Roll it out when you're ready." : "Install it for a few people today. Roll it out when you're ready."}
          </h2>
          <span className="text-[16px] text-muted">
            {IS_PILOT_MODE && <>Free during the pilot: {PILOT_TERMS}. </>}
            <Link href="/security" className="text-ink underline underline-offset-[3px]">Read how we handle data</Link>.
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href={cta.href}
            className="whitespace-nowrap rounded-btn bg-btn px-[22px] py-[13px] text-[16px] font-medium text-btn-fg transition-opacity hover:opacity-90">
            {cta.label}
          </Link>
          <Link href="mailto:hello@mykka.ai?subject=Enterprise enquiry"
            className="whitespace-nowrap rounded-btn bg-surface px-[22px] py-[13px] text-[16px] text-ink">
            Talk to us
          </Link>
        </div>
      </div>
    </section>
  )
}
