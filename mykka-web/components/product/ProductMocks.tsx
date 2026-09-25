import { MykkaLogo } from '@/components/layout/MykkaLogo'

// Static, illustrative panels for /product. Names and figures are fictional sample content.

const MARK = 'rounded-[3px] px-1 py-px font-mono text-[12px] bg-(--mark-bg) text-(--mark-fg)'

export function ExtensionMock() {
  return (
    <div className="flex justify-center rounded-[calc(var(--r)+6px)] bg-fill p-8">
      <div className="w-full max-w-[440px] overflow-hidden rounded-[calc(var(--r)+4px)] border border-line bg-surface shadow-(--shadow)"
        aria-label="Example of the Pretzel warning in the browser">
        <div className="flex flex-col gap-[7px] px-5 pb-3 pt-[18px]">
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <MykkaLogo size={16} />Pretzel · Northwind Legal
            <span className="flex-1" />
            <span className="rounded-btn border border-block px-2 py-px text-[12px] font-semibold leading-[1.4] text-block">Blocked</span>
          </div>
          <div className="text-[19px] font-semibold leading-[1.25] tracking-[-0.015em]">This prompt includes a client&apos;s personal details.</div>
          <div className="text-[14px] leading-[1.45] text-muted">Your company doesn&apos;t allow sending these to AI tools. We can take them out and send the rest.</div>
        </div>
        <div className="mx-5 rounded-[calc(var(--r)-4px)] bg-bg px-3.5 py-3 text-[14px] leading-[1.6]">
          Summarise this record for John Doe (SSN <span className={MARK}>123-45-6789</span>, <span className={MARK}>john.doe@acme.com</span>) and list next steps.
        </div>
        <div className="flex gap-2 px-5 pb-[18px] pt-3.5">
          <span className="flex-1 whitespace-nowrap rounded-btn bg-btn p-[11px] text-center text-[15px] font-medium text-btn-fg">Remove details &amp; send</span>
          <span className="whitespace-nowrap rounded-btn border border-line px-3.5 py-[11px] text-[15px]">Edit myself</span>
        </div>
      </div>
    </div>
  )
}

export function DesktopMock() {
  return (
    <div className="flex justify-center rounded-[calc(var(--r)+6px)] bg-fill p-8">
      <div className="flex w-full max-w-[340px] flex-col overflow-hidden rounded-token border border-line bg-surface shadow-(--shadow)"
        aria-label="Example of the Pretzel Desktop tray window">
        <div className="flex items-center gap-2.5 px-4 pb-3 pt-3.5">
          <MykkaLogo size={22} />
          <span className="flex-1 text-[15px] font-semibold">Pretzel</span>
        </div>
        <div className="mx-3 flex flex-col gap-1 rounded-[calc(var(--r)-4px)] bg-brand-soft p-4">
          <div className="flex items-center gap-2 text-[18px] font-semibold text-brand">
            <span className="size-2.5 rounded-full bg-brand" />You&apos;re protected
          </div>
          <div className="text-[14px] leading-[1.45]">Checking what you send against Northwind Legal&apos;s rules.</div>
        </div>
        <div className="flex flex-col px-4 pb-4 pt-3">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-2.5 py-[7px] text-[14px]">
            <span className="rounded-btn bg-block-fill px-2 py-px text-[12px] font-semibold text-block">Blocked</span>
            <span className="truncate">Client PII · ChatGPT app</span>
            <span className="text-[13px] text-muted">4m</span>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-2.5 border-t border-line py-[7px] text-[14px]">
            <span className="rounded-btn bg-warn-fill px-2 py-px text-[12px] font-semibold text-warn">Warned</span>
            <span className="truncate">Privileged text · Claude app</span>
            <span className="text-[13px] text-muted">1h</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const ATTENTION = [
  { t: "7 people haven't installed it", cls: 'bg-block-fill', dot: 'bg-block' },
  { t: '2 changes not published', cls: 'bg-warn-fill', dot: 'bg-warn' },
  { t: '4 people muted one rule', cls: 'bg-brand-soft', dot: 'bg-brand' },
]

export function ConsoleMock() {
  return (
    <div className="grid gap-7 rounded-[calc(var(--r)+4px)] border border-line bg-bg p-7 shadow-(--shadow) md:grid-cols-3">
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
        <div className="h-2 overflow-hidden rounded-full bg-fill"><div className="h-full w-[84%] bg-brand" /></div>
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
  )
}

export function AssistantMock() {
  return (
    <div className="flex flex-col gap-3 rounded-[calc(var(--r)+6px)] bg-fill p-7" aria-label="Example of an assistant change proposal">
      <div className="max-w-[85%] self-end rounded-token border border-line bg-surface px-3.5 py-3 text-[15px] leading-[1.5]">
        Add a Finance division, move Maya and Ben into it, and block card numbers for them.
      </div>
      <div className="flex items-start gap-2.5">
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">AI</span>
        <div className="flex-1 overflow-hidden rounded-token border border-line bg-surface">
          <div className="px-3.5 py-3 text-[15px] leading-[1.5]">Here&apos;s the change. Review it, then apply.</div>
          <div className="flex flex-col gap-1.5 border-t border-line px-3.5 py-2.5 font-mono text-[13px] text-brand">
            <span>+ Division  Finance</span>
            <span>+ Members   Maya Cohen, Ben Ari → Finance</span>
            <span>+ Rule      Card numbers → Block (Finance)</span>
          </div>
          <div className="flex gap-2 border-t border-line px-3.5 py-2.5">
            <span className="rounded-btn bg-btn px-4 py-2 text-[14px] font-medium text-btn-fg">Apply</span>
            <span className="rounded-btn border border-line px-4 py-2 text-[14px]">Discard</span>
          </div>
        </div>
      </div>
    </div>
  )
}
