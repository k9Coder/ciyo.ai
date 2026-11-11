/**
 * Judge v2 in shadow mode on the desktop app (docs/superpowers/specs/
 * 2026-11-11-judge-v2-shadow-mode-design.md), main-process side. The proxy
 * hands every inspected request here after the primary (regex/keyword)
 * decision; this only posts the job to a worker thread (judge-shadow-worker.ts)
 * where tokenizing and inference run, so the proxy's event loop is never
 * blocked. Only content-free rows come back, to be reported.
 *
 * The text judged is the same request body the primary rules see (raw JSON
 * from the AI site), so both sides are compared on identical input.
 */
import type { Policy, DetectionResult } from '@mykka/detect'
import { shadowRulesFrom, primarySummaryFrom, needsJudgeShadow, type JudgeShadowRow } from '@mykka/judge-v2'

export { shadowRulesFrom, primarySummaryFrom }

/** The subset of worker_threads.Worker used here (fakeable in tests). */
export interface WorkerLike {
  postMessage(message: unknown): void
  on(event: 'message' | 'error' | 'exit', listener: (value: unknown) => void): unknown
}

export interface DesktopShadow {
  submit(body: string, policy: Policy, result: DetectionResult): void
  /** Start the background model download when the policy needs it. */
  prepare(policy: Policy | null): void
}

export function createDesktopShadow(deps: { spawn: () => WorkerLike; report: (rows: JudgeShadowRow[]) => void }): DesktopShadow {
  let worker: WorkerLike | null = null

  function getWorker(): WorkerLike | null {
    if (worker) return worker
    try {
      const w = deps.spawn()
      w.on('message', (m) => {
        const msg = m as { type?: string; rows?: JudgeShadowRow[] }
        if (msg?.type === 'rows' && Array.isArray(msg.rows)) deps.report(msg.rows)
      })
      const drop = () => { if (worker === w) worker = null }
      w.on('error', drop)
      w.on('exit', drop)
      worker = w
    } catch {
      worker = null
    }
    return worker
  }

  function post(message: unknown): void {
    try {
      getWorker()?.postMessage(message)
    } catch {
      // Shadow mode must never affect the proxy.
    }
  }

  return {
    submit(body, policy, result) {
      if (!needsJudgeShadow(policy)) return
      post({ type: 'submit', text: body, rules: shadowRulesFrom(policy), primary: primarySummaryFrom(result) })
    },
    prepare(policy) {
      if (needsJudgeShadow(policy)) post({ type: 'prepare' })
    },
  }
}
