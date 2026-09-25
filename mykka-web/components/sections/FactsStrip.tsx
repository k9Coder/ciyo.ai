const FACTS = [
  { t: 'On-device detection', d: 'Prompts are checked before they leave' },
  { t: 'Browser and desktop', d: 'Chrome extension and a Windows / Mac app' },
  { t: 'Rules per team', d: 'Different policies for Legal, Finance, Eng' },
  { t: 'The prompt stays private', d: 'Admins see the rule and site, not the text' },
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
