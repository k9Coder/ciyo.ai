import Link from 'next/link'
import type { Metadata } from 'next'
import { AppWindow, LayoutDashboard, MessageSquareText, Monitor, type LucideIcon } from 'lucide-react'
import { IS_PILOT_MODE } from '@/lib/config'
import { primaryCta } from '@/lib/cta'
import { AssistantMock, ConsoleMock, DesktopMock, ExtensionMock } from '@/components/product/ProductMocks'

export const metadata: Metadata = {
  title: 'How Pretzel Works — Browser and Desktop AI DLP',
  description: 'Pretzel checks AI prompts before they are sent, in the browser and in a desktop app, blocking PII, credentials, and sensitive data from reaching ChatGPT, Claude, and Gemini. One policy, managed in one console.',
  alternates: { canonical: 'https://mykka.ai/product' },
  openGraph: {
    title: 'How Pretzel Works — Browser and Desktop AI DLP',
    description: 'Two apps your team installs, one console you run. Sensitive data is stopped at the point of input, before it reaches the AI provider.',
  },
}

const AEO_QA = [
  {
    question: 'What is Pretzel?',
    answer: 'Pretzel is a browser extension and a desktop app that prevent employees from accidentally sending sensitive data to AI tools like ChatGPT, Claude, and Gemini. It checks every AI prompt before it is submitted — scanning the text for personally identifiable information (PII), source code, API keys, credentials, and other sensitive content your organization needs to protect. When Pretzel detects a policy violation, it stops the prompt and shows the user exactly what was caught. Unlike traditional data loss prevention solutions that operate at the network level, Pretzel stops leaks at the source, before any data is transmitted. Security administrators manage protection policies through Pretzel Console, a centralized dashboard where teams define custom detection rules, publish policy updates across the organization, and review an audit log of blocked and flagged events.',
  },
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
  {
    question: 'What is AI DLP (AI Data Loss Prevention)?',
    answer: 'AI DLP — Artificial Intelligence Data Loss Prevention — is a category of security software designed to prevent employees from sharing sensitive organizational data with AI tools and large language models. As tools like ChatGPT, Claude, and Gemini became standard in the workplace, organizations face a new class of data leakage risk: employees pasting customer PII, source code, financial records, legal documents, and credentials into AI chat interfaces. Traditional DLP solutions were built for email, file transfers, and removable media — they cannot intercept browser-based AI prompt submissions. AI DLP tools close this gap by monitoring and blocking sensitive content at the point of input, before a prompt reaches the AI provider\'s servers. Policy-based AI DLP platforms allow security administrators to define what constitutes sensitive data, enforce different rules for different teams, and maintain audit trails for regulatory compliance.',
  },
  {
    question: 'How is browser-native AI DLP different from network DLP?',
    answer: 'Browser-native AI DLP operates inside the web browser, intercepting prompts before they are submitted — before any data leaves the user\'s device. Network-level DLP tools sit between the corporate network and the internet, inspecting traffic after it has already been sent from the browser. Network DLP cannot inspect encrypted HTTPS traffic without complex TLS inspection setups, which are difficult to maintain and can break modern web applications. Browser-native DLP like Pretzel operates at the point of input, reading the prompt text exactly as the user typed it — before encryption occurs. It also requires no network configuration changes, no proxy setup, and no IT infrastructure modifications for the browser extension. Administrators configure and publish policies centrally through the Pretzel Console.',
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
      operatingSystem: 'Chrome, Windows, macOS',
      description: 'Chrome extension and desktop app that prevent employees from sending sensitive data to AI tools. Checks prompts before submission using pattern, entropy, keyword, and score-based detection.',
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

const JUMPS: Array<{ Icon: LucideIcon; href: string; label: string }> = [
  { Icon: AppWindow, href: '#extension', label: 'Extension' },
  { Icon: Monitor, href: '#desktop', label: 'Desktop' },
  { Icon: LayoutDashboard, href: '#console', label: 'Console' },
  { Icon: MessageSquareText, href: '#assistant', label: 'Assistant' },
]

const H2_CLASS = 'm-0 text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.1] tracking-[-0.03em]'
const KICKER = 'font-mono text-[13px] text-muted'
const ROW_SPLIT = 'mx-auto grid max-w-[1200px] items-center gap-14 px-6 md:grid-cols-2'

export default function ProductPage() {
  const cta = primaryCta()
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="mx-auto flex max-w-[1200px] flex-col gap-[18px] px-6 pb-10 pt-[72px]">
        <div className={KICKER}>Product</div>
        <h1 className="m-0 max-w-[900px] text-balance text-[clamp(38px,5vw,60px)] font-semibold leading-[1.04] tracking-[-0.035em]">
          Two apps your team installs. One console you run.
        </h1>
        <p className="m-0 max-w-[640px] text-[19px] leading-[1.5] text-muted">
          Employees get the browser extension and, if they use AI desktop apps, Pretzel Desktop. IT sets one policy in the console, and both apps follow it.
        </p>
        <nav aria-label="On this page" className="mt-2 flex flex-wrap gap-2">
          {JUMPS.map(({ Icon, href, label }) => (
            <a key={href} href={href}
              className="flex items-center gap-2 rounded-btn border border-line px-3.5 py-2 text-[15px] text-ink transition-colors hover:border-ink">
              <Icon size={18} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />{label}
            </a>
          ))}
        </nav>
      </section>

      <section id="extension" className={`${ROW_SPLIT} scroll-mt-20 py-14`}>
        <div className="flex flex-col gap-4">
          <span className={KICKER}>01 · Browser extension</span>
          <h2 className={H2_CLASS}>Stops the prompt before it&apos;s sent, then offers a safe way to send it.</h2>
          <div className="flex flex-col border-t border-line">
            <div className="border-b border-line py-3 text-[16px] leading-[1.5]"><b className="font-semibold">Block</b> <span className="text-muted">for data that must never leave. One click removes it and sends the rest.</span></div>
            <div className="border-b border-line py-3 text-[16px] leading-[1.5]"><b className="font-semibold">Warn</b> <span className="text-muted">for things that need a second look. The person decides.</span></div>
            <div className="border-b border-line py-3 text-[16px] leading-[1.5]"><b className="font-semibold">Deploy</b> <span className="text-muted">from the Chrome Web Store or push it with Chrome Enterprise.</span></div>
          </div>
        </div>
        <ExtensionMock />
      </section>

      <section id="desktop" className={`${ROW_SPLIT} scroll-mt-20 py-14`}>
        <div className="flex flex-col gap-4 md:order-2">
          <span className={KICKER}>02 · Pretzel Desktop</span>
          <h2 className={H2_CLASS}>Covers the AI apps outside the browser.</h2>
          <p className="m-0 text-[17px] leading-[1.55] text-muted">
            A small app for Windows and Mac. It sits in the tray, shows one clear status (protected or off), and opens the same block and warn window when a rule matches.
          </p>
          <div className="flex flex-wrap gap-[18px] text-[15px]">
            <span className="flex items-center gap-[7px]"><span className="size-2 rounded-full bg-brand" />Protected</span>
            <span className="flex items-center gap-[7px]"><span className="size-2 rounded-full bg-warn" />Rules not loaded</span>
            <span className="flex items-center gap-[7px]"><span className="size-2 rounded-full bg-block" />Protection off</span>
          </div>
          <Link href="/download" className="self-start text-[16px] text-ink underline underline-offset-4">Download Pretzel Desktop</Link>
        </div>
        <div className="md:order-1"><DesktopMock /></div>
      </section>

      <section id="console" className="scroll-mt-16 border-y border-line bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-6 py-[88px]">
          <div className="flex max-w-[680px] flex-col gap-3.5">
            <span className={KICKER}>03 · Admin console</span>
            <h2 className={H2_CLASS}>One screen tells you if everyone is covered.</h2>
            <p className="m-0 text-[17px] leading-[1.55] text-muted">
              Policies, people, activity and publishing. The overview shows coverage, what was caught this week and anything that isn&apos;t live yet.
            </p>
          </div>
          <ConsoleMock />
        </div>
      </section>

      <section id="assistant" className={`${ROW_SPLIT} scroll-mt-20 py-[88px]`}>
        <div className="flex flex-col gap-4">
          <span className={KICKER}>04 · Assistant</span>
          <h2 className={H2_CLASS}>Ask for a change. Review it. Apply it.</h2>
          <p className="m-0 text-[17px] leading-[1.55] text-muted">
            The assistant can add divisions and teams, write rules and invite people. Every change shows as a diff first, and nothing goes live until you publish.
          </p>
        </div>
        <AssistantMock />
      </section>

      <section className="mx-auto max-w-[1200px] px-6 pb-20">
        <p className="mb-3 text-center font-mono text-[13px] text-muted">How it works</p>
        <h2 className="mb-10 text-center text-[clamp(28px,3.4vw,40px)] font-semibold tracking-[-0.03em]">Common questions</h2>
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {AEO_QA.map(({ question, answer }) => (
            <div key={question} className="rounded-token border border-line bg-surface p-7">
              <h3 className="mb-3 text-[18px] font-semibold text-ink">{question}</h3>
              <p className="m-0 text-[15px] leading-relaxed text-muted">{answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-7 rounded-[calc(var(--r)+6px)] bg-fill p-12">
          <h2 className="m-0 max-w-[600px] text-[clamp(26px,3vw,36px)] font-semibold leading-[1.1] tracking-[-0.03em]">{IS_PILOT_MODE ? 'Try all four in the pilot.' : 'Try all four.'}</h2>
          <div className="flex flex-wrap gap-2.5">
            <Link href={cta.href} className="whitespace-nowrap rounded-btn bg-btn px-[22px] py-[13px] text-[16px] font-medium text-btn-fg transition-opacity hover:opacity-90">{cta.label}</Link>
            <Link href="/security" className="whitespace-nowrap rounded-btn bg-surface px-[22px] py-[13px] text-[16px] text-ink">Security</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
