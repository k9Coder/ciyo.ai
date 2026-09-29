'use client'

import { useState, useSyncExternalStore } from 'react'
import { Check, Copy, Globe, Monitor } from 'lucide-react'
import { CHROME_EXTENSION_ID, CHROME_WEB_STORE_URL } from '@/lib/config'
import type { DownloadAsset, Downloads } from './getDownloads'

type PickKey = 'chrome' | 'win' | 'mac'
type Os = 'mac' | 'win' | 'other'

interface Option {
  key: PickKey
  title: string
  meta: string
  cta: string
  href: string
  available: boolean
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function detectOs(): Os {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/Mac/.test(ua)) return 'mac'
  if (/Win/.test(ua)) return 'win'
  return 'other'
}

// Chrome and Chromium-based Edge both ship the extension APIs it needs; everything else
// (Safari, Firefox, or a non-browser UA) gets steered to Pretzel Desktop instead.
function detectIsChromium(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Chrome|Edg\//.test(navigator.userAgent)
}

function buildOptions(downloads: Downloads): Record<PickKey, Option> {
  // Apple Silicon has been the default Mac since 2020; the single "Mac" download offered here
  // (matching the redesign) points at the arm64 build, falling back to Intel if that's all
  // there is. Both stay reachable individually in "All downloads" only via this one link, so an
  // Intel-only build with no arm64 build still works — there's just no separate Intel row.
  const mac = downloads.macArm ?? downloads.macIntel
  const macAsset: DownloadAsset | null = mac
  const winAsset = downloads.windows
  const version = downloads.version ? `v${downloads.version}` : null

  return {
    chrome: {
      key: 'chrome',
      title: 'Pretzel for Chrome',
      meta: 'Browser extension · works in Chrome and Edge',
      cta: 'Add to Chrome',
      href: CHROME_WEB_STORE_URL,
      available: true,
    },
    win: {
      key: 'win',
      title: 'Pretzel Desktop for Windows',
      meta: winAsset
        ? `Windows 10 or 11 · 64-bit${version ? ` · ${version}` : ''}`
        : 'Windows 10 or 11 · 64-bit',
      cta: winAsset ? `Download for Windows (${formatBytes(winAsset.size)})` : 'Unavailable',
      href: winAsset?.url ?? '#',
      available: !!winAsset,
    },
    mac: {
      key: 'mac',
      title: 'Pretzel Desktop for Mac',
      meta: macAsset
        ? `macOS 13+ · Apple silicon and Intel${version ? ` · ${version}` : ''}`
        : 'macOS 13+ · Apple silicon and Intel',
      cta: macAsset ? `Download for Mac (${formatBytes(macAsset.size)})` : 'Unavailable',
      href: macAsset?.url ?? '#',
      available: !!macAsset,
    },
  }
}

export function DownloadClient({ downloads }: { downloads: Downloads }) {
  const [copied, setCopied] = useState(false)

  // Server-rendered HTML has no navigator, so the snapshot used during SSR and first hydration
  // must be a constant that matches on both sides — real detection only kicks in client-side,
  // same pattern as the platform detection this file used before the redesign.
  const isChromium = useSyncExternalStore(() => () => {}, detectIsChromium, () => false)
  const os = useSyncExternalStore(() => () => {}, detectOs, () => 'other' as Os)

  const options = buildOptions(downloads)
  const pickKey: PickKey = isChromium ? 'chrome' : os === 'mac' ? 'mac' : os === 'win' ? 'win' : 'chrome'
  const pick = options[pickKey]
  const others = (['chrome', 'win', 'mac'] as const).filter((k) => k !== pickKey).map((k) => options[k])
  const osLabel = os === 'mac' ? 'your Mac' : os === 'win' ? 'your Windows PC' : 'your computer'

  async function copyExtensionId() {
    try {
      await navigator.clipboard.writeText(CHROME_EXTENSION_ID)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard permission denied — nothing to fall back to, leave the button as-is.
    }
  }

  return (
    <>
      <section className="mx-auto flex max-w-[1200px] flex-col gap-[18px] px-6 pb-10 pt-[72px]">
        <div className="font-mono text-[13px] text-muted">Download</div>
        <h1 className="m-0 max-w-[860px] text-balance text-[clamp(38px,5vw,60px)] font-semibold leading-[1.04] tracking-[-0.035em]">
          Install Pretzel, then sign in with your work email.
        </h1>
        <p className="m-0 max-w-[640px] text-[19px] leading-[1.5] text-muted">
          The extension covers ChatGPT, Claude and Gemini in Chrome. Pretzel Desktop covers AI apps
          outside the browser. Most people only need the extension.
        </p>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 pb-14">
        <div className="grid grid-cols-1 items-center gap-6 rounded-[calc(var(--r)+4px)] border-[1.5px] border-brand bg-surface p-8 shadow-(--shadow) sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <span className="flex size-14 items-center justify-center rounded-token bg-brand-soft text-brand">
            {pick.key === 'chrome'
              ? <Globe size={28} strokeWidth={1.5} aria-hidden="true" />
              : <Monitor size={28} strokeWidth={1.5} aria-hidden="true" />}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-mono text-[12px] text-brand">Recommended for {osLabel}</span>
            <span className="text-[clamp(22px,2.4vw,28px)] font-semibold tracking-[-0.02em]">{pick.title}</span>
            <span className="text-[15px] text-muted">{pick.meta}</span>
          </div>
          <a
            href={pick.href}
            download={pick.key !== 'chrome' && pick.available}
            aria-disabled={!pick.available}
            className={`flex items-center gap-[9px] whitespace-nowrap rounded-btn px-6 py-[14px] text-[16px] font-medium ${
              pick.available ? 'bg-btn text-btn-fg hover:opacity-90' : 'pointer-events-none bg-fill text-muted'
            }`}
          >
            {pick.key === 'chrome'
              ? <Globe size={18} strokeWidth={1.5} aria-hidden="true" />
              : <Monitor size={18} strokeWidth={1.5} aria-hidden="true" />}
            {pick.cta}
          </a>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1200px] flex-col gap-[18px] px-6 pb-20">
        <h2 className="m-0 text-[22px] font-semibold tracking-[-0.015em]">All downloads</h2>
        <div className="overflow-hidden rounded-token border border-line bg-surface">
          {others.map((d, i) => (
            <div
              key={d.key}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 px-6 py-5 ${i ? 'border-t border-line' : ''}`}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[17px] font-medium">{d.title}</span>
                <span className="text-[14px] text-muted">{d.meta}</span>
              </div>
              <a
                href={d.href}
                download={d.key !== 'chrome' && d.available}
                aria-disabled={!d.available}
                className={`whitespace-nowrap rounded-btn border px-[18px] py-2.5 text-[15px] ${
                  d.available ? 'border-line text-ink hover:border-ink' : 'pointer-events-none border-line text-muted'
                }`}
              >
                {d.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-6 py-20 md:grid-cols-2">
          <div className="flex flex-col gap-5">
            <h2 className="m-0 text-[clamp(26px,3vw,36px)] font-semibold leading-[1.1] tracking-[-0.03em]">
              Invited by your admin?
            </h2>
            <div className="flex flex-col">
              {[
                'Install the extension above.',
                'Click the Pretzel icon and sign in with the email your invite was sent to.',
                "That's it. Your company's rules load in a few seconds.",
              ].map((step, i, arr) => (
                <div
                  key={step}
                  className={`grid grid-cols-[32px_minmax(0,1fr)] gap-3 border-t border-line py-3.5 ${i === arr.length - 1 ? 'border-b' : ''}`}
                >
                  <span className="font-mono text-[14px] text-muted">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-[16px] leading-[1.5]">{step}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <h2 className="m-0 text-[clamp(26px,3vw,36px)] font-semibold leading-[1.1] tracking-[-0.03em]">
              Installing for everyone?
            </h2>
            <p className="m-0 text-[16px] leading-[1.55] text-muted">
              Force-install the extension with Chrome Enterprise, or push Pretzel Desktop with your
              MDM. Your organization token is in the console under Settings.
            </p>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted">Extension ID</span>
              <div className="flex items-center gap-2 rounded-token-sm border border-line bg-bg px-3 py-2.5">
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[14px]">
                  {CHROME_EXTENSION_ID}
                </span>
                <button
                  onClick={copyExtensionId}
                  className="flex items-center gap-1.5 rounded-btn bg-fill px-3 py-1.5 text-[13px] text-ink"
                >
                  {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <a
              href="https://docs.mykka.ai/enterprise"
              className="text-[16px] text-ink underline underline-offset-4"
            >
              Deployment guide
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1200px] flex-wrap gap-7 px-6 pb-24 pt-14 text-[14px] text-muted">
        <span><b className="font-semibold text-ink">Extension</b> · Chrome 116+, Edge 116+</span>
        <span><b className="font-semibold text-ink">Windows</b> · 10 or 11, 64-bit</span>
        <span><b className="font-semibold text-ink">macOS</b> · 13 Ventura or later, Apple silicon and Intel</span>
      </section>
    </>
  )
}
