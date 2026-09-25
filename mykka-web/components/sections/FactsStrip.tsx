import { IS_PILOT_MODE } from '@/lib/config'

const FACTS = [
  { t: 'On-device detection', d: 'Prompts are checked in the browser' },
  { t: 'No proxy', d: 'Nothing to change on the network' },
  { t: 'Rules per team', d: 'Different policies for Legal, Finance, Eng' },
  IS_PILOT_MODE
    ? { t: 'Free during early access', d: 'No credit card' }
    : { t: 'Free for 3 people', d: 'No credit card' },
]

export function FactsStrip() {
  return (
    <section className="border-y border-line">
      <div className="mx-auto grid max-w-[1200px] gap-x-8 gap-y-4 px-6 py-[22px] sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.map(({ t, d }) => (
          <div key={t} className="flex flex-col gap-[3px]">
            <span className="text-[16px] font-medium">{t}</span>
            <span className="text-[14px] text-muted">{d}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
