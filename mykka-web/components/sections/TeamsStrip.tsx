import Link from 'next/link'
import { Code, CreditCard, Scale, Stethoscope, type LucideIcon } from 'lucide-react'
import { H2 } from './H2'

// Slugs match app/solutions/[industry] (finance is the "fintech" page).
export const INDUSTRIES: Array<{ Icon: LucideIcon; name: string; blurb: string; slug: string }> = [
  { Icon: Scale, name: 'Legal', blurb: 'Client data, privileged text', slug: 'legal' },
  { Icon: Stethoscope, name: 'Healthcare', blurb: 'Patient records, IDs', slug: 'healthcare' },
  { Icon: CreditCard, name: 'Finance', blurb: 'Cards, accounts, deals', slug: 'fintech' },
  { Icon: Code, name: 'Engineering', blurb: 'Keys, tokens, source code', slug: 'engineering' },
]

export function TeamsStrip() {
  return (
    <section className="mx-auto grid max-w-[1200px] items-start gap-12 px-6 py-24 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <H2>Built for teams that handle other people&apos;s data</H2>
        <Link href="/solutions" className="text-[16px] text-ink underline underline-offset-4">All solutions</Link>
      </div>
      <div className="flex flex-col">
        {INDUSTRIES.map(({ Icon, name, blurb, slug }) => (
          <Link key={slug} href={`/solutions/${slug}`}
            className="flex justify-between gap-4 border-b border-line py-[18px] text-ink transition-colors hover:text-brand">
            <span className="flex items-center gap-3 text-[19px] font-medium">
              <Icon size={22} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />{name}
            </span>
            <span className="text-[15px] text-muted">{blurb}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
