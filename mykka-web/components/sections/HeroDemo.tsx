'use client'
import { useEffect, useState } from 'react'
import { MykkaLogo } from '@/components/layout/MykkaLogo'
import { DEMO_SCENARIOS, fullText, sentParts, sentNote, type DemoPart } from '@/lib/hero-demo'

type Phase = 'typing' | 'modal' | 'sent' | 'edit'

const CHARS_PER_TICK = 2
const TICK_MS = 28
const MODAL_DELAY_MS = 600

const MARK = 'rounded-[3px] px-1 py-px font-mono text-[12px]'

function Parts({ parts, hitClass }: { parts: DemoPart[]; hitClass: string }) {
  return (
    <>
      {parts.map((p, i) => (p.hit ? <span key={i} className={`${MARK} ${hitClass}`}>{p.text}</span> : <span key={i}>{p.text}</span>))}
    </>
  )
}

// Scripted demo of the extension's warning: types a risky prompt, shows the modal, lets the visitor
// pick an option. Nothing here calls the backend (see lib/hero-demo.ts).
export function HeroDemo() {
  const [scen, setScen] = useState(0)
  const [typedLen, setTypedLen] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')

  const s = DEMO_SCENARIOS[scen]!
  const text = fullText(s)
  const warn = s.kind === 'warn'

  // Start (or replay) a scenario: empty box, typing phase.
  function restart(next: number) {
    setScen(next)
    setTypedLen(0)
    setPhase('typing')
  }

  // Type the prompt out. With reduced motion the whole prompt appears at once.
  useEffect(() => {
    if (phase !== 'typing') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const step = reduced ? text.length : CHARS_PER_TICK
    const iv = setInterval(() => setTypedLen((n) => Math.min(text.length, n + step)), TICK_MS)
    return () => clearInterval(iv)
  }, [phase, text])

  // Once the whole prompt is typed, pause briefly and show the warning.
  useEffect(() => {
    if (phase !== 'typing' || typedLen < text.length) return
    const t = setTimeout(() => setPhase('modal'), MODAL_DELAY_MS)
    return () => clearTimeout(t)
  }, [phase, typedLen, text])

  const send = () => setPhase('sent')
  const edit = () => setPhase('edit')

  const hit = warn
    ? 'bg-warn-fill text-warn'
    : 'bg-(--mark-bg) text-(--mark-fg)'
  const pillColor = warn ? 'text-warn border-warn' : 'text-block border-block'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Demo scenarios">
        {DEMO_SCENARIOS.map((x, j) => (
          <button key={x.key} type="button" aria-pressed={j === scen}
            onClick={() => restart(j)}
            className={`flex cursor-pointer items-center gap-[7px] rounded-btn border px-[13px] py-[7px] text-[14px] text-ink ${j === scen ? 'border-ink bg-surface' : 'border-line bg-transparent'}`}>
            <span className={`size-[7px] rounded-full ${x.kind === 'warn' ? 'bg-warn' : 'bg-block'}`} />
            {x.label}
          </button>
        ))}
      </div>

      <div className="relative flex h-[500px] flex-col overflow-hidden rounded-[calc(var(--r)+4px)] border border-line bg-surface shadow-(--shadow)">
        <div className="flex items-center gap-2.5 border-b border-line bg-bg px-3.5 py-2.5">
          <span className="flex gap-[5px]" aria-hidden="true">
            <span className="size-[9px] rounded-full bg-fill" /><span className="size-[9px] rounded-full bg-fill" /><span className="size-[9px] rounded-full bg-fill" />
          </span>
          <span className="flex-1 rounded-btn border border-line bg-surface px-3 py-1 font-mono text-[12px] text-muted">{s.site}</span>
          <span className="font-mono text-[11px] text-muted">demo</span>
        </div>

        <div className="flex flex-1 flex-col gap-3.5 overflow-hidden px-[22px] pb-3 pt-[22px]">
          <div className="max-w-[80%] self-start text-[15px] leading-[1.5] text-muted">Hi Dana. What can I help with?</div>
          {phase === 'sent' && (
            <>
              <div className="max-w-[86%] self-end rounded-token bg-fill px-3.5 py-3 text-[14px] leading-[1.6]">
                <Parts parts={sentParts(s)} hitClass="bg-brand-soft text-brand" />
              </div>
              <div className="-mt-1.5 flex items-center gap-1.5 self-end text-[12px] text-brand">
                <span className="size-1.5 rounded-full bg-brand" />{sentNote(s)}
              </div>
              <div className="max-w-[86%] self-start text-[15px] leading-[1.5]">{s.reply}</div>
            </>
          )}
          {phase === 'edit' && (
            <div className="mt-auto self-center text-[14px] text-muted">
              Nothing was sent. The prompt is back in the box for editing.
            </div>
          )}
        </div>

        <div className="px-4 pb-4 pt-3">
          <div className="flex min-h-12 items-end gap-2.5 rounded-token border border-line bg-bg py-3 pl-4 pr-3">
            <div className="flex max-h-[90px] flex-1 flex-col justify-end overflow-hidden text-[14px] leading-[1.55] text-ink">
              <span>
                {phase === 'sent' ? '' : text.slice(0, typedLen)}
                <span className={`demo-caret ml-px inline-block h-[15px] w-0.5 bg-ink align-[-2px] ${phase === 'typing' || phase === 'edit' ? 'opacity-100' : 'opacity-0'}`} />
              </span>
            </div>
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-btn bg-ink text-[15px] text-bg">↑</span>
          </div>
        </div>

        {phase === 'modal' && (
          <div className="absolute inset-0 flex items-center justify-center bg-(--scrim) p-[18px]">
            <div role="dialog" aria-label={s.title}
              className="w-full max-w-[440px] overflow-hidden rounded-[calc(var(--r)+4px)] border border-line bg-surface shadow-(--shadow)">
              <div className="flex flex-col gap-[7px] px-5 pb-3 pt-[18px]">
                <div className="flex items-center gap-2 text-[13px] text-muted">
                  <MykkaLogo size={16} />Pretzel · Northwind Legal
                  <span className="flex-1" />
                  <span className={`rounded-btn border px-2 py-px text-[12px] font-semibold leading-[1.4] ${pillColor}`}>{warn ? 'Warning' : 'Blocked'}</span>
                </div>
                <div className="text-[19px] font-semibold leading-[1.25] tracking-[-0.015em]">{s.title}</div>
                <div className="text-[14px] leading-[1.45] text-muted">{s.sub}</div>
              </div>
              <div className="mx-5 max-h-[116px] overflow-hidden rounded-[calc(var(--r)-4px)] bg-bg px-3.5 py-3 text-[14px] leading-[1.6]">
                <Parts parts={s.parts} hitClass={hit} />
              </div>
              <div className="mx-5 mt-2.5 flex flex-col gap-[3px] text-[13px] text-muted">
                {s.findings.map((f) => (
                  <div key={f.what} className="flex justify-between gap-2.5"><span>{f.what}</span><span>{f.rule}</span></div>
                ))}
              </div>
              <div className="flex gap-2 px-5 pb-[18px] pt-3.5">
                <button type="button" onClick={warn ? edit : send}
                  className="flex-1 cursor-pointer whitespace-nowrap rounded-btn border-0 bg-btn p-[11px] text-[15px] font-medium text-btn-fg">
                  {s.primary}
                </button>
                <button type="button" onClick={warn ? send : edit}
                  className="flex-1 cursor-pointer whitespace-nowrap rounded-btn border border-line bg-transparent px-3.5 py-[11px] text-[15px] text-ink">
                  {s.secondary}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between gap-3 text-[13px] text-muted">
        <span>This is the real warning your team sees. Try the buttons.</span>
        <button type="button" onClick={() => restart(scen)}
          className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-ink underline underline-offset-[3px]">
          Replay
        </button>
      </div>
    </div>
  )
}
