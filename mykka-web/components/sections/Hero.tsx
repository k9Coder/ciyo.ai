import Link from 'next/link'
import { APP_URL } from '@/lib/config'
import { HeroDemo } from './HeroDemo'

export function Hero() {
  return (
    <section id="top" className="mx-auto grid max-w-[1200px] items-center gap-14 px-6 pb-[72px] pt-20 lg:grid-cols-2">
      <div className="flex flex-col gap-[22px]">
        <div className="flex items-center gap-2 font-mono text-[13px] text-brand">
          <span className="size-[7px] rounded-full bg-brand" />
          Chrome extension for ChatGPT, Claude and Gemini
        </div>
        <h1 className="m-0 text-balance text-[clamp(40px,5.4vw,64px)] font-semibold leading-[1.02] tracking-[-0.035em]">
          Let your team use AI. Keep client data out of it.
        </h1>
        <p className="m-0 max-w-[540px] text-pretty text-[19px] leading-[1.5] text-muted">
          Pretzel checks every prompt before it&apos;s sent and catches personal data, passwords and code.
          It offers to remove them, so people can keep working. Detection runs on the device.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Link href={`${APP_URL}/onboarding`}
            className="whitespace-nowrap rounded-btn bg-btn px-[22px] py-[13px] text-[16px] font-medium text-btn-fg transition-opacity hover:opacity-90">
            Start free
          </Link>
          <Link href="#how"
            className="whitespace-nowrap rounded-btn bg-fill px-[22px] py-[13px] text-[16px] text-ink">
            How it works
          </Link>
        </div>
        <div className="text-[14px] text-muted">No proxy or network changes. No credit card.</div>
      </div>

      <HeroDemo />
    </section>
  )
}
