import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { APP_URL } from '@/lib/config'

export const metadata: Metadata = {
  title: 'How Pretzel Works — Browser-Native AI DLP',
  description: 'Pretzel intercepts AI prompts before submission, blocking PII, credentials, and sensitive data from reaching ChatGPT, Claude, and Gemini. No network changes. Centrally managed policies.',
  alternates: { canonical: 'https://mykka.ai/product' },
  openGraph: {
    title: 'How Pretzel Works — Browser-Native AI DLP',
    description: 'Pretzel sits in the browser and scans every AI prompt before it is sent. Sensitive data is blocked at the point of input — before it reaches the AI provider.',
  },
}

const SECTIONS: Array<{ tag: string; headline: string; body: string; image?: string }> = [
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
    image: '/images/product/console-dashboard.png',
  },
  {
    tag: 'AI Policy Assistant',
    headline: 'Manage security in plain English',
    body: `The hardest part of DLP is knowing what to block. Describe it in plain English and the Pretzel AI assistant proposes the exact rule.

"Block any prompt from the Finance team that contains a credit card number." The assistant proposes the rule — subject, pattern, and scope — for you to review and approve. It never applies a change on its own.`,
    image: '/images/product/console-assistant.png',
  },
]

const AEO_QA = [
  {
    question: 'How does Pretzel detect sensitive data in AI prompts?',
    answer: 'Pretzel uses four detection methods running locally in the browser. Pattern matching catches known formats: Social Security numbers, credit card numbers, IBAN codes, email addresses, and phone numbers. Entropy detection identifies API keys, tokens, and passwords by their statistical randomness — catching credentials even if they are not in your keyword list. Keyword and dictionary rules block custom terms your organization defines: client names, internal project codenames, and regulated terms. Score-based rules combine multiple signals to flag prompts that are borderline individually but sensitive in combination. All detection runs before the prompt is submitted — no prompt text is sent to mykka.ai servers.',
  },
  {
    question: 'Does Pretzel send prompt content to mykka.ai servers?',
    answer: 'No. Detection runs entirely within the browser extension. When an employee types or pastes content into ChatGPT, Claude, or Gemini, Pretzel evaluates the prompt locally against the organization\'s policy before the send button is activated. The full prompt text never reaches mykka.ai infrastructure. What is transmitted to the backend: policy update checks (every two minutes, pulling the compiled policy snapshot), and anonymized scan event metadata for audit and analytics — specifically which rule triggered and what action was taken. The content of blocked or allowed prompts is not transmitted.',
  },
  {
    question: 'What AI tools does Pretzel work with?',
    answer: 'Pretzel works on ChatGPT (chat.openai.com), Claude (claude.ai), and Gemini (gemini.google.com) out of the box. The extension can also be configured to work on additional AI sites using a custom CSS selector for the prompt input field and send button — this makes it compatible with internal AI tools and any other browser-based AI chat interface. Each additional site is configured through the Pretzel Console and requires a domain allowance in the browser extension manifest. Enterprise customers can request additional site support.',
  },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://mykka.ai/#pretzel',
      name: 'Pretzel',
      applicationCategory: 'SecurityApplication',
      applicationSubCategory: 'Data Loss Prevention',
      operatingSystem: 'Chrome',
      description: 'Browser extension that prevents employees from sending sensitive data to AI tools. Intercepts prompts before submission using pattern, entropy, keyword, and score-based detection.',
      url: 'https://mykka.ai/product',
    },
    {
      '@type': 'FAQPage',
      mainEntity: AEO_QA.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
  ],
}

function BrowserExtensionMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d10] shadow-2xl shadow-black/50"
      aria-label="Pretzel extension blocking a sensitive prompt in ChatGPT">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#111115] px-4 py-3">
        <span className="size-3 rounded-full bg-[#ff5f57]" aria-hidden="true" />
        <span className="size-3 rounded-full bg-[#febc2e]" aria-hidden="true" />
        <span className="size-3 rounded-full bg-[#28c840]" aria-hidden="true" />
        <div className="ml-3 flex-1 rounded-md bg-white/[0.05] px-3 py-1 text-left text-[11px] text-[#64748b]">
          chat.openai.com
        </div>
      </div>
      <div className="px-6 py-8">
        <div className="mb-4 rounded-xl border border-[#ff4d4d]/30 bg-[#ff4d4d]/[0.06] p-4 text-left">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[#ff4d4d]" aria-hidden="true">⚠</span>
            <span className="text-[13px] font-bold text-[#ff4d4d]">Pretzel blocked this prompt</span>
          </div>
          <p className="mb-3 text-[12px] text-[#94a3b8]">
            Sensitive content detected before submission to ChatGPT:
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-3 py-1.5 text-[11px]">
              <span className="font-mono text-[#ff9f40]">AWS access key</span>
              <span className="text-[#64748b]">→</span>
              <span className="rounded bg-[#ff4d4d]/20 px-1.5 py-0.5 font-mono text-[#ff4d4d]">AKIA••••••••••••••••</span>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-3 py-1.5 text-[11px]">
              <span className="font-mono text-[#ff9f40]">Customer email</span>
              <span className="text-[#64748b]">→</span>
              <span className="rounded bg-[#ff4d4d]/20 px-1.5 py-0.5 font-mono text-[#ff4d4d]">j.doe@••••.com</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#17171e] px-4 py-3">
          <div className="flex-1 text-left text-[12px] text-[#4b5563] line-through">
            Debug why this fails: AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE, contact j.doe@acme.com…
          </div>
          <div className="ml-4 flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#5b8cff]" aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5b8cff]">Blocked</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProductPage() {
  return (
    <div className="px-6 py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]">Product</p>
        <h1 className="mb-4 text-center text-5xl font-extrabold tracking-tight text-white">
          How Pretzel Protects Your Team
        </h1>
        <p className="mx-auto mb-8 max-w-xl text-center text-[16px] text-[#94a3b8]">
          Three surfaces, one mission: make sure sensitive data never reaches an AI it shouldn&apos;t.
        </p>
        <div className="mb-20 text-center">
          <Link href={`${APP_URL}/onboarding`}
            className="inline-block rounded-xl bg-[#5b8cff] px-7 py-3 text-[15px] font-bold text-white shadow-lg shadow-[#5b8cff]/25 transition hover:bg-[#3f6fe0] hover:shadow-[#5b8cff]/40">
            Start Free — No Credit Card
          </Link>
        </div>

        {SECTIONS.map(({ tag, headline, body, image }, i) => (
          <div key={tag} className={`mb-24 flex flex-col gap-12 md:flex-row ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}>
            <div className="flex-1">
              <span className="mb-4 inline-block rounded-full border border-[#5b8cff]/30 bg-[#5b8cff]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#8fb3ff]">{tag}</span>
              <h2 className="mb-4 text-3xl font-extrabold leading-tight tracking-tight text-white">{headline}</h2>
              {body.split('\n\n').map((para, j) => (
                <p key={j} className="mb-4 text-[15px] leading-relaxed text-[#94a3b8]">{para}</p>
              ))}
            </div>
            <div className="flex-1 self-center">
              {image ? (
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#17171e] shadow-2xl shadow-black/50" style={{ aspectRatio: '8/5' }}>
                  <Image src={image} alt={`${tag} in the Pretzel Console`} fill sizes="(min-width: 768px) 40vw, 90vw" className="object-cover object-top" />
                </div>
              ) : (
                <BrowserExtensionMockup />
              )}
            </div>
          </div>
        ))}

        <section className="mb-20 border-t border-white/[0.05] pt-20">
          <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]">How It Works</p>
          <h2 className="mb-14 text-center text-4xl font-extrabold tracking-tight text-white">
            Common Questions
          </h2>
          <div className="space-y-6">
            {AEO_QA.map(({ question, answer }) => (
              <div key={question} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-8">
                <h3 className="mb-4 text-[18px] font-bold text-white">{question}</h3>
                <p className="text-[15px] leading-relaxed text-[#94a3b8]">{answer}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="text-center">
          <Link href={`${APP_URL}/onboarding`}
            className="rounded-xl bg-[#5b8cff] px-8 py-3 text-[15px] font-bold text-white shadow-lg shadow-[#5b8cff]/25 transition hover:bg-[#3f6fe0]">
            Start Free — No Credit Card
          </Link>
        </div>
      </div>
    </div>
  )
}
