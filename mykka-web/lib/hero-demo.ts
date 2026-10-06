// Scripted scenarios for the home-page demo (components/sections/HeroDemo.tsx).
// Nothing here calls the backend: the names, ids and keys are fictional and safe to publish.

export interface DemoPart {
  text: string
  /** Part that the rule matched (highlighted in the warning). */
  hit?: boolean
  /** What "Remove details & send" replaces a hit with. A hit without it is sent as-is (warn rules). */
  redact?: string
}

export interface DemoScenario {
  key: string
  label: string
  kind: 'block' | 'warn'
  site: string
  parts: DemoPart[]
  title: string
  sub: string
  findings: Array<{ what: string; rule: string }>
  primary: string
  secondary: string
  reply: string
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    key: 'pii', label: 'Client data', kind: 'block', site: 'chatgpt.com',
    parts: [
      { text: 'Rank these clients by how rich they are and make it a fun table: Jane Roe, SSN ' },
      { text: '123-45-6789', hit: true, redact: '[SSN]' },
      { text: ', card ' },
      { text: '4580 1234 5678 9012', hit: true, redact: '[CARD]' },
      { text: '; Tom Hale, SSN ' },
      { text: '987-65-4321', hit: true, redact: '[SSN]' },
      { text: ', lives at 14 Elm St.' },
    ],
    title: "This prompt includes clients' personal details.",
    sub: "Your company doesn't allow these in AI tools. We can take them out and send the rest.",
    findings: [{ what: 'US Social Security number × 2', rule: 'Client PII' }, { what: 'Card number', rule: 'Client PII' }],
    primary: 'Remove details & send', secondary: 'Edit myself',
    reply: "Here's the table. I left the ID and card columns empty, since those were removed.",
  },
  {
    key: 'priv', label: 'Privileged memo', kind: 'warn', site: 'claude.ai',
    parts: [
      { text: 'Make this sound friendlier so we can send it to the other side: ' },
      { text: 'PRIVILEGED & CONFIDENTIAL', hit: true },
      { text: ' — ' },
      { text: 'attorney-client communication', hit: true },
      { text: '. Our client knew the product was faulty in March…' },
    ],
    title: 'This looks like privileged wording.',
    sub: "You can still send it. Make sure it's okay to share with Claude.",
    findings: [{ what: '"Privileged & confidential"', rule: 'Privileged text' }, { what: '"Attorney-client"', rule: 'Privileged text' }],
    primary: 'Edit myself', secondary: "It's fine, send it",
    reply: 'Here is a softer version of the memo…',
  },
  {
    key: 'key', label: 'API key', kind: 'block', site: 'gemini.google.com',
    parts: [
      { text: "Why won't this deploy? " },
      { text: 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG', hit: true, redact: '[AWS KEY]' },
      { text: ' and the prod DB password is ' },
      { text: 'Hunter2!', hit: true, redact: '[PASSWORD]' },
      { text: ', we use it everywhere.' },
    ],
    title: 'This prompt includes a secret key and a password.',
    sub: 'Credentials should never go to AI tools. We can take them out and send the rest.',
    findings: [{ what: 'AWS secret key', rule: 'Credentials' }, { what: 'Password', rule: 'Credentials' }],
    primary: 'Remove details & send', secondary: 'Edit myself',
    reply: 'The deploy fails because the key variable is read before the config loads. Move it…',
  },
]

/** The whole prompt, as typed into the box. */
export function fullText(s: DemoScenario): string {
  return s.parts.map((p) => p.text).join('')
}

/** The prompt as it goes out after "Remove details & send" (block) or unchanged (warn). */
export function sentParts(s: DemoScenario): DemoPart[] {
  return s.parts.map((p) => (p.hit && p.redact ? { text: p.redact, hit: true } : { text: p.text }))
}

export function redactedCount(s: DemoScenario): number {
  return s.parts.filter((p) => p.hit && p.redact).length
}

/** Line under the sent prompt. */
export function sentNote(s: DemoScenario): string {
  if (s.kind === 'warn') return 'Sent after warning · recorded: rule and site'
  const n = redactedCount(s)
  return `Sent with ${n} detail${n === 1 ? '' : 's'} removed`
}
