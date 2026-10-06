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

// The judge only ever sees MAX_LENGTH=96 tokens (themis-judge.ts truncates),
// so anything past a few thousand characters is discarded anyway — slicing
// here avoids tokenizing a full request body (proxy.ts allows up to 2MB)
// synchronously on the same Electron main-process event loop that also
// services the MITM proxy's other connections.
const MAX_JUDGE_INPUT_CHARS = 2_000

export function isLocalJudgePocEnabled(): boolean {
  return process.env.PRETZEL_LOCAL_JUDGE_POC === '1'
}

/** Fire-and-forget — callers must not await this on the request-handling path. */
export async function runLocalJudgePoc(hostname: string, body: string): Promise<void> {
  if (!isLocalJudgePocEnabled()) return
  if (!judge.isAvailable()) {
    console.log(`[local-judge-poc] host=${hostname} judge not ready (still loading or failed), skipping`)
    return
  }

  const text = body.slice(0, MAX_JUDGE_INPUT_CHARS)
  for (const rule of POC_JUDGE_RULES) {
    try {
      const start = Date.now()
      const result = await judge.classify({ text, prompt: rule.prompt })
      const ms = Date.now() - start
      console.log(
        `[local-judge-poc] host=${hostname} rule=${rule.id} verdict=${result.verdict} confidence=${result.confidence.toFixed(2)} ms=${ms}`,
      )
    } catch (err) {
      console.error(`[local-judge-poc] host=${hostname} rule=${rule.id} failed`, err)
    }
  }
}
