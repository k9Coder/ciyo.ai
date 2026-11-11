/**
 * Worker-thread entry for the judge v2 shadow runner. The main process posts
 * { type: 'submit' | 'prepare' } messages; this thread posts back
 * { type: 'rows', rows } (content-free) for reporting. Loaded via
 * `./judge-shadow-worker?modulePath` in main.ts.
 */
import { parentPort, workerData } from 'worker_threads'
import type { PrimarySummary, ShadowRule } from '@mykka/judge-v2'
import { createDesktopRunner } from './judge-shadow-runner'

type InMessage =
  | { type: 'submit'; text: string; rules: ShadowRule[]; primary: PrimarySummary }
  | { type: 'prepare' }

const data = workerData as { userDataDir: string; modelBase?: string }
const runner = createDesktopRunner({
  userDataDir: data.userDataDir,
  modelBase: data.modelBase,
  report: (rows) => parentPort?.postMessage({ type: 'rows', rows }),
})

parentPort?.on('message', (m: InMessage) => {
  try {
    if (m.type === 'submit') runner.submit(m.text, m.rules, m.primary)
    else if (m.type === 'prepare') runner.prepare()
  } catch {
    // The worker must never die on one bad message.
  }
})
