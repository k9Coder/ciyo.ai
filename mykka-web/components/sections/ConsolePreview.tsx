import { H2 } from './H2'

const ATTENTION = [
  { t: "7 people haven't installed it", cls: 'bg-block-fill', dot: 'bg-block' },
  { t: '2 changes not published', cls: 'bg-warn-fill', dot: 'bg-warn' },
  { t: '4 people muted one rule', cls: 'bg-brand-soft', dot: 'bg-brand' },
]

// Illustrative sample data; the figures are not real usage.
export function ConsolePreview() {
  return (
    <section className="mx-auto flex max-w-[1200px] flex-col gap-9 px-6 py-24">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <H2 className="max-w-[640px] text-balance">One page tells you if everyone is covered.</H2>
        <p className="m-0 max-w-[420px] text-[16px] leading-[1.55] text-muted">
          The console shows who has the extension, what was caught this week, and changes that aren&apos;t live yet.
        </p>
      </div>
      <div className="grid gap-7 rounded-[calc(var(--r)+4px)] border border-line bg-surface p-7 shadow-(--shadow) md:grid-cols-3">
        <div className="flex flex-col gap-3">
          <span className="text-[15px] text-muted">Last 14 days</span>
          <span className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em]">
            Pretzel stopped <span className="text-block">27</span> prompts and flagged{' '}
            <span className="text-warn">64</span>, out of 4,812.
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-[15px] text-muted">Covered</span>
          <div className="flex items-baseline gap-2">
            <span className="text-[40px] font-semibold tracking-[-0.03em]">38</span>
            <span className="text-muted">of 45 people</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-fill">
            <div className="h-full w-[84%] bg-brand" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[15px] text-muted">Needs attention</span>
          {ATTENTION.map(({ t, cls, dot }) => (
            <div key={t} className={`flex items-center gap-2.5 rounded-[calc(var(--r)-4px)] px-3 py-[9px] ${cls}`}>
              <span className={`size-[7px] shrink-0 rounded-full ${dot}`} />
              <span className="text-[15px]">{t}</span>
            </div>
          ))}
        </div>
        <p className="col-span-full m-0 font-mono text-[12px] text-muted">Sample data</p>
      </div>
    </section>
  )
}
