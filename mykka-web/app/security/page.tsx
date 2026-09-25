import type { Metadata } from 'next'
import { FAQ } from '@/components/sections/FAQ'

export const metadata: Metadata = {
  title: 'AI DLP Security Architecture — How Pretzel Handles Your Data',
  description: 'Pretzel runs detection locally in the browser — full prompt text never reaches mykka.ai servers. Here is exactly what is stored, where, and what we have not done yet.',
  alternates: { canonical: 'https://mykka.ai/security' },
  openGraph: {
    title: 'Security & Trust — How Pretzel Handles Your Data',
    description: 'Detection runs locally. Full prompt text is never transmitted to mykka.ai. See exactly what is stored and where.',
  },
}

const POINTS = [
  {
    icon: '🔒',
    title: 'Full prompts are never sent to us',
    body: 'Detection runs locally in the browser extension. When a rule matches, Pretzel records which rule fired, which AI site, and which member triggered it. If the rule is set to report matched content, a short excerpt of the matched text (for example the API key or card number that matched) is also sent and stored in your organisation’s audit log, where your admins can see it. Rules set to a lower report level send no excerpt. The full text of a prompt is never transmitted to or stored on our servers.',
  },
  {
    icon: '🔐',
    title: 'Encryption and token handling',
    body: 'API traffic uses HTTPS. Data at rest is encrypted by our database provider. Your organisation and admin tokens are stored only as bcrypt hashes — we cannot recover them.',
  },
  {
    icon: '🌍',
    title: 'Where your data lives',
    body: 'Our database is hosted on Neon (AWS us-east-1, United States). The backend runs on Render, the website on Vercel, sign-in is handled by Clerk, and application errors go to Sentry. If you use the AI Policy Assistant, your assistant messages are sent to the model provider (Anthropic, OpenAI or Groq). See the Privacy Policy for the full list. We do not currently offer EU data residency.',
  },
  {
    icon: '🧹',
    title: 'Retention',
    body: 'Scan counts and enforcement signals are deleted automatically after 90 days. Audit-log events, including any matched excerpts, are kept while your organisation account is active. During early access there is no automatic expiry on audit-log events; email privacy@mykka.ai and we will delete them on request.',
  },
  {
    icon: '📋',
    title: 'Early access — what we have not done yet',
    body: 'Pretzel is in early access. We have not completed a third-party security audit such as SOC 2, and we do not yet have a standard Data Processing Agreement. If your organisation requires either, tell us at security@mykka.ai — it helps us decide what to prioritise.',
  },
  {
    icon: '🐛',
    title: 'Responsible disclosure',
    body: 'Found a vulnerability? Email security@mykka.ai. We will acknowledge reports as quickly as we can and prioritise critical issues.',
  },
]

// Single source for the visible FAQ and the FAQPage JSON-LD, so structured data matches the page.
const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'Does Pretzel store or transmit the content of AI prompts?',
    answer: 'The full text of a prompt is never transmitted to or stored on mykka.ai servers; detection runs locally on the device. Pretzel records which rule fired, which AI site, and which member triggered the event. For rules configured to report matched content, a short excerpt of the matched text is also stored in the organisation’s audit log. What the admin sees depends on each rule’s report level: none, action and site only, who triggered it, or the matched term.',
  },
  {
    question: 'What happens if the extension fails?',
    answer: 'It fails open so work isn’t blocked, and the console shows a “protection degraded” alert with the site and reason.',
  },
  {
    question: 'What encryption does Pretzel use?',
    answer: 'API traffic between the extension and the mykka.ai backend uses HTTPS. Data at rest is encrypted by the database provider. Organization and admin tokens are stored only as bcrypt hashes.',
  },
  {
    question: 'Is Pretzel SOC 2 certified?',
    answer: 'No. Pretzel is in early access and has not completed a third-party audit such as SOC 2.',
  },
  {
    question: 'Where is Pretzel data stored?',
    answer: 'The database is hosted on Neon on AWS us-east-1 in the United States. EU data residency is not currently offered.',
  },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  url: 'https://mykka.ai/security',
  mainEntity: FAQ_ITEMS.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  })),
}

export default function SecurityPage() {
  return (
    <div className="px-6 py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-brand">Security &amp; Trust</p>
        <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-ink">How We Handle Your Data</h1>
        <p className="mb-16 text-[16px] text-muted">CISOs ask hard questions. Here are honest answers.</p>
        <div className="space-y-4">
          {POINTS.map(({ icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-line bg-surface p-7">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-2xl" aria-hidden="true">{icon}</span>
                <h2 className="text-[17px] font-bold text-ink">{title}</h2>
              </div>
              <p className="text-[14px] leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
        <FAQ title="Questions IT asks us" items={FAQ_ITEMS} />
      </div>
    </div>
  )
}
