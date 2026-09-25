import { H2 } from './H2'

const STEPS = [
  { n: '01', t: 'Install the extension', d: 'Add Pretzel from the Chrome Web Store, or push it with Chrome Enterprise. People sign in with their work account.' },
  { n: '02', t: 'Choose what to protect', d: 'Pick presets such as client personal data, credentials or financial data, or describe a rule in plain words and review it before it goes live.' },
  { n: '03', t: 'Publish, then check in', d: 'Publishing sends the policy to every browser within minutes. The overview shows coverage, catches and anything that needs you.' },
]

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto flex max-w-[1200px] flex-col gap-11 px-6 py-24">
      <H2 className="max-w-[760px] text-balance">Set it up in an afternoon. Check on it once a week.</H2>
      <div className="grid gap-10 md:grid-cols-3">
        {STEPS.map(({ n, t, d }) => (
          <div key={n} className="flex flex-col gap-3 border-t-2 border-ink pt-[18px]">
            <span className="font-mono text-[14px] text-muted">{n}</span>
            <span className="text-[22px] font-semibold tracking-[-0.015em]">{t}</span>
            <span className="text-pretty text-[16px] leading-[1.55] text-muted">{d}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
