import Link from 'next/link'
import { APP_URL } from '@/lib/config'

export function CTABanner() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-7 rounded-[calc(var(--r)+6px)] bg-fill px-8 py-14 md:px-12">
        <h2 className="m-0 max-w-[620px] text-[clamp(28px,3.2vw,40px)] font-semibold leading-[1.1] tracking-[-0.03em]">
          Install it for a few people today. Roll it out when you&apos;re ready.
        </h2>
        <div className="flex flex-wrap gap-2.5">
          <Link href={`${APP_URL}/onboarding`}
            className="whitespace-nowrap rounded-btn bg-btn px-[22px] py-[13px] text-[16px] font-medium text-btn-fg transition-opacity hover:opacity-90">
            Start free
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
