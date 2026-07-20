import Link from 'next/link'
import type { Metadata } from 'next'
import { APP_URL } from '@/lib/config'

export const metadata: Metadata = {
  title: 'How Pretzel Works — Browser-Native AI DLP | ciyo.ai',
  description: 'Pretzel intercepts AI prompts before submission, blocking PII, credentials, and sensitive data from reaching ChatGPT, Claude, and Gemini. No network changes. Centrally managed policies.',
  alternates: { canonical: 'https://ciyo.ai/product' },
  openGraph: {
    title: 'How Pretzel Works — Browser-Native AI DLP',
    description: 'Pretzel sits in the browser and scans every AI prompt before it is sent. Sensitive data is blocked at the point of input — before it reaches the AI provider.',
  },
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

const AEO_QA = [
  {
    question: 'How does Pretzel detect sensitive data in AI prompts?',
    answer: 'Pretzel uses four detection methods running locally in the browser. Pattern matching catches known formats: Social Security numbers, credit card numbers, IBAN codes, email addresses, and phone numbers. Entropy detection identifies API keys, tokens, and passwords by their statistical randomness — catching credentials even if they are not in your keyword list. Keyword and dictionary rules block custom terms your organization defines: client names, internal project codenames, and regulated terms. Score-based rules combine multiple signals to flag prompts that are borderline individually but sensitive in combination. All detection runs before the prompt is submitted — no prompt text is sent to ciyo.ai servers.',
  },
  {
    question: 'Does Pretzel send prompt content to ciyo.ai servers?',
    answer: 'No. Detection runs entirely within the browser extension. When an employee types or pastes content into ChatGPT, Claude, or Gemini, Pretzel evaluates the prompt locally against the organization\'s policy before the send button is activated. The full prompt text never reaches ciyo.ai infrastructure. What is transmitted to the backend: policy update checks (every two minutes, pulling the compiled policy snapshot), and anonymized scan event metadata for audit and analytics — specifically which rule triggered and what action was taken. The content of blocked or allowed prompts is not transmitted.',
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
      '@id': 'https://ciyo.ai/#pretzel',
      name: 'Pretzel',
      applicationCategory: 'SecurityApplication',
      applicationSubCategory: 'Data Loss Prevention',
      operatingSystem: 'Chrome',
      description: 'Browser extension that prevents employees from sending sensitive data to AI tools. Intercepts prompts before submission using pattern, entropy, keyword, and score-based detection.',
      url: 'https://ciyo.ai/product',
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

export default function ProductPage() {
  return (
    <div className="px-6 py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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

        <section className="mb-20 border-t border-white/[0.05] pt-20">
          <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">How It Works</p>
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
            className="rounded-xl bg-[#7c6aff] px-8 py-3 text-[15px] font-bold text-white shadow-lg shadow-[#7c6aff]/25 transition hover:bg-[#6b59ee]">
            Start Free — No Credit Card
          </Link>
        </div>
      </div>
    </div>
  )
}
