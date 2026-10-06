/**
 * Contract for an on-device judge model (Jev or a stand-in) that decides
 * whether content matches a natural-language rule prompt, as opposed to the
 * fixed pattern/dictionary/entropy functions in detection/engine.ts.
 *
 * Deliberately minimal and swap-friendly: every call site (desktop, extension)
 * only ever depends on this interface, never on a specific backing model, so
 * replacing the implementation costs nothing at the call sites.
 */

export interface JudgeInput {
  /** The captured content to judge (never serialized off-device). */
  text: string
  /** The rule's natural-language description of what to flag. */
  prompt: string
}

export interface JudgeVerdict {
  verdict: 'match' | 'no_match'
  /** 0-1 confidence in the verdict. */
  confidence: number
}

export interface LocalJudge {
  classify(input: JudgeInput): Promise<JudgeVerdict>
  /** False when the model isn't loaded/supported on this device — callers must not block on it. */
  isAvailable(): boolean
}
