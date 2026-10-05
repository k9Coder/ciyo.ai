/**
 * Shadow-mode wiring for the local-judge PoC (branch: spike/local-judge-poc).
 *
 * Runs judge-prompt test rules against the same text the DETECT handler
 * already inspects, and only LOGS verdicts — never affects the returned
 * DetectionResult, never blocks/warns. Gated on PRETZEL_LOCAL_JUDGE_POC=1.
 *
 * Uses ThemisLocalJudge (DeBERTa-v3-small, fine-tuned + vocabulary-pruned,
 * same model as the extension's offscreen/themis-judge.ts) running natively
 * via onnxruntime-node — no WASM, no browser sandbox, since this runs
 * directly in Electron's main process.
 */
import { POC_JUDGE_RULES, type LocalJudge } from '@mykka/detect'
import { ThemisLocalJudge } from './themis-judge'

const judge: LocalJudge = new ThemisLocalJudge()

export function isLocalJudgePocEnabled(): boolean {
  return process.env.PRETZEL_LOCAL_JUDGE_POC === '1'
}

/** Fire-and-forget — callers must not await this on the request-handling path. */
export async function runLocalJudgePoc(hostname: string, body: string): Promise<void> {
  if (!isLocalJudgePocEnabled() || !judge.isAvailable()) return

  for (const rule of POC_JUDGE_RULES) {
    try {
      const start = Date.now()
      const result = await judge.classify({ text: body, prompt: rule.prompt })
      const ms = Date.now() - start
      console.log(
        `[local-judge-poc] host=${hostname} rule=${rule.id} verdict=${result.verdict} confidence=${result.confidence.toFixed(2)} ms=${ms}`,
      )
    } catch (err) {
      console.error(`[local-judge-poc] host=${hostname} rule=${rule.id} failed`, err)
    }
  }
}
