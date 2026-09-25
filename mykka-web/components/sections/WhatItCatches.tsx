import { H2 } from './H2'

const BLOCKS = { label: 'Blocks', cls: 'bg-block-fill text-block' }
const WARNS = { label: 'Warns', cls: 'bg-warn-fill text-warn' }

const DETECTIONS = [
  { t: 'ID and card numbers', how: 'Pattern', ex: '•••-••-6789  ·  4580 •••• ••••', ...BLOCKS },
  { t: 'Passwords, API keys, tokens', how: 'Entropy + pattern', ex: 'AKIA••••••••  ·  ghp_••••', ...BLOCKS },
  { t: 'Emails and phone numbers', how: 'Pattern', ex: 'j.doe@••••.com', ...WARNS },
  { t: 'Client and project names', how: 'Your keyword list', ex: '"Project Atlas"  ·  "Acme v. Doe"', ...WARNS },
  { t: 'Privileged or confidential text', how: 'Keywords', ex: '"attorney-client"', ...WARNS },
]

export function WhatItCatches() {
  return (
    <section id="catches" className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-[1200px] items-start gap-12 px-6 py-24 lg:grid-cols-2">
        <div className="flex flex-col gap-4 lg:sticky lg:top-[100px]">
          <H2>What it catches</H2>
          <p className="m-0 max-w-[440px] text-[17px] leading-[1.55] text-muted">
            Start from a preset, then add your own words: client names, project codenames, internal hostnames.
            Each rule either warns or blocks.
          </p>
        </div>
        <div className="flex flex-col">
          {DETECTIONS.map(({ t, how, ex, label, cls }) => (
            <div key={t}
              className="grid items-center gap-x-4 gap-y-1 border-b border-line py-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
              <div className="flex flex-col gap-0.5">
                <span className="text-[17px] font-medium">{t}</span>
                <span className="text-[14px] text-muted">{how}</span>
              </div>
              <span className="truncate font-mono text-[13px] text-muted">{ex}</span>
              <span className={`w-fit whitespace-nowrap rounded-btn px-2.5 py-[3px] text-[13px] font-medium ${cls}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
