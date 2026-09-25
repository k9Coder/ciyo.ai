'use client'
import { useState } from 'react'

const MARK = 'rounded-[3px] px-1 py-px font-mono text-[13px]'
const FLAGGED = `${MARK} bg-(--mark-bg) text-(--mark-fg)`
const REDACTED = `${MARK} bg-brand-soft text-brand`

// Static demo of the extension's "block" modal and the after-redaction state. Nothing here calls the backend.
export function HeroDemo() {
  const [redacted, setRedacted] = useState(false)

  return (
    <div className="flex flex-col gap-3.5 rounded-[calc(var(--r)+6px)] bg-fill p-7">
      <div className="flex justify-between font-mono text-[12px] text-muted">
        <span>chatgpt.com</span>
        <span>live demo · try it</span>
      </div>

      {!redacted ? (
        <div className="overflow-hidden rounded-token border border-line bg-surface shadow-(--shadow)">
          <div className="flex flex-col gap-2 px-[22px] pb-3.5 pt-5">
            <div className="flex items-center gap-[7px] text-[14px] text-muted">
              <span className="size-2 rounded-full bg-block" />Pretzel · Northwind Legal
            </div>
            <div className="text-[22px] font-semibold leading-[1.2] tracking-[-0.015em]">
              Hold on. This includes a client&apos;s personal details.
            </div>
            <div className="text-[15px] leading-[1.45] text-muted">
              We can take them out and send the rest. Nothing has left your browser.
            </div>
          </div>
          <div className="mx-[22px] rounded-[calc(var(--r)-4px)] bg-bg px-4 py-3.5 text-[15px] leading-[1.65]">
            Summarise this record for John Doe (SSN <span className={FLAGGED}>123-45-6789</span>,{' '}
            <span className={FLAGGED}>john.doe@acme.com</span>) and list next steps.
          </div>
          <div className="flex flex-wrap gap-2 px-[22px] pb-[22px] pt-[18px]">
            <button type="button" onClick={() => setRedacted(true)}
              className="min-w-[200px] flex-1 cursor-pointer rounded-btn border-0 bg-btn p-3 text-[16px] font-medium text-btn-fg">
              Remove details &amp; send
            </button>
            <button type="button"
              className="shrink-0 cursor-pointer whitespace-nowrap rounded-btn border border-line bg-transparent px-4 py-3 text-[15px] text-ink">
              Edit myself
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 rounded-token border border-line bg-surface p-[22px]">
          <div className="flex items-center gap-[7px] text-[14px] text-brand">
            <span className="size-2 rounded-full bg-brand" />Sent with 2 details removed
          </div>
          <div className="rounded-[calc(var(--r)-4px)] bg-bg px-4 py-3.5 text-[15px] leading-[1.65]">
            Summarise this record for John Doe (SSN <span className={REDACTED}>[SSN]</span>,{' '}
            <span className={REDACTED}>[EMAIL]</span>) and list next steps.
          </div>
          <div className="text-[14px] leading-[1.5] text-muted">
            The admin sees the rule, site and time in the activity log, not the full prompt.
          </div>
          <button type="button" onClick={() => setRedacted(false)}
            className="cursor-pointer self-start rounded-btn border-0 bg-fill px-4 py-[9px] text-[14px] text-ink">
            Run it again
          </button>
        </div>
      )}
    </div>
  )
}
