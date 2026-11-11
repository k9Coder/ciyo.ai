/**
 * End-to-end smoke test of the desktop judge v2 shadow path without starting
 * the app (which would change the system proxy): download from a local model
 * server, verify, load, judge, print the rows that would be reported.
 *
 *   JUDGE_V2_MODEL_BASE=http://127.0.0.1:8799/ pnpm exec tsx scripts/smoke-judge-shadow.ts <scratch-dir>
 */
import { mkdirSync } from 'fs'
import { DEFAULT_POLICY, detectPrompt } from '@mykka/detect'
import type { Policy } from '@mykka/detect'
import type { JudgeShadowRow } from '@mykka/judge-v2'
import { createDesktopShadow } from '../electron/judge-shadow'

const dir = process.argv[2]
const base = process.env.JUDGE_V2_MODEL_BASE
if (!dir || !base) throw new Error('usage: JUDGE_V2_MODEL_BASE=<url> tsx scripts/smoke-judge-shadow.ts <dir>')
mkdirSync(dir, { recursive: true })

const policy: Policy = {
  ...DEFAULT_POLICY,
  custom: [
    { id: '11111111-1111-4111-8111-111111111111', name: 'clients', description: '', severity: 'high', action: 'block', enabled: true,
      tags: [], enforced: false, kind: 'judge_prompt', prompt: 'The message lists customer names together with their contact details.' },
    { id: '22222222-2222-4222-8222-222222222222', name: 'salary', description: '', severity: 'high', action: 'block', enabled: true,
      tags: [], enforced: false, kind: 'judge_prompt', prompt: "The message reveals an employee's salary." },
  ],
} as Policy

const rows: JudgeShadowRow[] = []
const shadow = createDesktopShadow({ userDataDir: dir, report: (r) => rows.push(...r), modelBase: base })

async function main(): Promise<void> {
  const t0 = Date.now()
  shadow.prepare(policy)
  const MESSAGES = [
    'Can you format this for the newsletter? Our top clients: Dana Levi, dana.levi@acme-mail.com, +972-52-555-0199; Omar Haddad, omar@haddad-co.net, +1 415 555 0142.',
    'What is a good name for a pet turtle?',
  ]
  async function waitReady(): Promise<void> {
    // The first submit triggers/joins the download and is skipped; poll until rows come back judged.
    for (;;) {
      rows.length = 0
      const text = MESSAGES[0]!
      shadow.submit(text, policy, await detectPrompt({ text, hostname: 'chatgpt.com', inputType: 'prompt' }, policy))
      await new Promise((r) => setTimeout(r, 5000))
      if (rows.length && rows.every((r) => r.secondaryVerdict !== 'skipped')) return
    }
  }
  await waitReady()
  console.log(`ready + first check after ${Math.round((Date.now() - t0) / 1000)} s`)
  for (const text of MESSAGES) {
    rows.length = 0
    shadow.submit(text, policy, await detectPrompt({ text, hostname: 'chatgpt.com', inputType: 'prompt' }, policy))
    while (rows.length === 0) await new Promise((r) => setTimeout(r, 200))
    for (const r of rows) console.log(JSON.stringify(r))
  }
  const leaked = rows.some((r) => JSON.stringify(r).includes('Dana') || JSON.stringify(r).includes('turtle'))
  console.log('rows contain message text:', leaked)
  process.exit(0)
}

void main()
