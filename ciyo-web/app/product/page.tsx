import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Product',
  description: 'How Pretzel protects your team — extension, console, AI assistant, and analytics.',
}

const SECTIONS = [
  {
    tag: 'Browser Extension',
    headline: 'Intercepts prompts before they\'re sent',
    body: `Pretzel sits silently in your browser and scans every prompt the moment you type it. When a keyword, pattern, or high-entropy string (like an API key) is detected, Pretzel shows an inline warning — or blocks the send button entirely.

It works on ChatGPT, Claude, Gemini, Perplexity, and any other AI site you configure. No proxy required. No network changes. Just a Chrome extension and a policy.`,
  },
  {
    tag: 'Pretzel Console',
    headline: 'Manage policies for your whole company',
    body: `The Pretzel Console is where your security team configures what gets blocked. Create subjects (like "Customer PII" or "Source Code"), attach rules (keywords, regex, entropy detection), and scope them to the whole org, a division, or a specific team.

One click publishes your new policy to every employee's browser. No MDM required for updates.`,
  },
  {
    tag: 'AI Policy Assistant',
    headline: 'Manage security in plain English',
    body: `The hardest part of DLP is knowing what to block. The Pretzel AI assistant makes it conversational.

"Block any prompt from the Finance team that contains a credit card number." Done. The assistant creates a regex rule, scopes it to the Finance team, and proposes it for your approval — all in seconds.

It can also audit your existing policy, flag gaps for HIPAA or SOC2, and generate an executive summary of last week's events.`,
  },
]

export default function ProductPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Product</p>
        <h1 className="mb-4 text-center text-5xl font-extrabold tracking-tight text-white">
          How Pretzel Protects Your Team
        </h1>
        <p className="mx-auto mb-20 max-w-xl text-center text-[16px] text-[#94a3b8]">
          Three surfaces, one mission: make sure sensitive data never reaches an AI it shouldn&apos;t.
        </p>

        {SECTIONS.map(({ tag, headline, body }, i) => (
          <div key={tag} className={`mb-24 flex flex-col gap-12 md:flex-row ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}>
            <div className="flex-1">
              <span className="mb-4 inline-block rounded-full border border-[#7c6aff]/30 bg-[#7c6aff]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#a78bfa]">{tag}</span>
              <h2 className="mb-4 text-3xl font-extrabold leading-tight tracking-tight text-white">{headline}</h2>
              {body.split('\n\n').map((para, j) => (
                <p key={j} className="mb-4 text-[15px] leading-relaxed text-[#94a3b8]">{para}</p>
              ))}
            </div>
            <div className="flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#17171e]"
              style={{ aspectRatio: '8/5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p className="text-[13px] text-[#64748b]">{tag} screenshot</p>
            </div>
          </div>
        ))}

        <div className="text-center">
          <Link href="https://app.ciyo.ai/onboarding"
            className="rounded-xl bg-[#7c6aff] px-8 py-3 text-[15px] font-bold text-white shadow-lg shadow-[#7c6aff]/25 transition hover:bg-[#6b59ee]">
            Start Free — No Credit Card
          </Link>
        </div>
      </div>
    </div>
  )
}
