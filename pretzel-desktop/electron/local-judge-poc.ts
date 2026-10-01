/**
 * Shadow-mode wiring for the local-judge PoC (branch: spike/local-judge-poc,
 * see docs/superpowers/specs equivalent plan "client-local LLM judge" design).
 *
 * Runs a LocalJudge against the same request body tier 1 (`evaluateRequest`)
 * already inspects, and only LOGS the verdict — never affects enforcement,
 * never blocks/warns, never touches the response path. Entirely gated behind
 * PRETZEL_LOCAL_JUDGE_POC=1 so it is a no-op everywhere outside this spike.
 *
 * `judge` is swapped from StubLocalJudge to a real on-device model (Jev or a
 * stand-in) once the wiring proven here holds up — that swap costs nothing
 * because both sides of the call only ever touch the LocalJudge interface.
 */
import { StubLocalJudge, POC_JUDGE_RULES, type LocalJudge } from '@mykka/detect'

const judge: LocalJudge = new StubLocalJudge()

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
