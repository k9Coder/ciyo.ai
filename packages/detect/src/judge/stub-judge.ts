import type { JudgeInput, JudgeVerdict, LocalJudge } from './types'

/**
 * Deterministic placeholder standing in for a real on-device model (Jev or
 * equivalent) during the wiring spike (spike/local-judge-poc). Never ships as
 * the real judge — exists only to prove the call sites (desktop proxy,
 * extension offscreen document) work end-to-end before a real model is wired
 * in behind the same LocalJudge contract.
 *
 * Heuristic: crude keyword overlap between the rule prompt and the text.
 * Good enough to produce varying verdicts/confidence for wiring/shadow-mode
 * testing — not a stand-in for actual judgment quality.
 */
export class StubLocalJudge implements LocalJudge {
  isAvailable(): boolean {
    return true
  }

  async classify(input: JudgeInput): Promise<JudgeVerdict> {
    const haystack = input.text.toLowerCase()
    const promptWords = input.prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4)

    const hits = promptWords.filter((w) => haystack.includes(w)).length
    const confidence = promptWords.length === 0 ? 0 : hits / promptWords.length

    return {
      verdict: confidence >= 0.15 ? 'match' : 'no_match',
      confidence,
    }
  }
}
