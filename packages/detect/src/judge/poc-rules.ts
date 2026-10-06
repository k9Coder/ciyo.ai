/**
 * Hardcoded test rules for the local-judge wiring spike (spike/local-judge-poc).
 * Stand-ins for what would eventually be authored via the pretzel-console
 * assistant and shipped through the policy compiler as `kind: "judge_prompt"`
 * rules — skipped here on purpose, since authoring/publish plumbing isn't the
 * open technical risk this spike exists to test.
 */

export interface JudgePromptRule {
  id: string
  prompt: string
}

export const POC_JUDGE_RULES: JudgePromptRule[] = [
  {
    id: 'poc-ssn',
    prompt:
      "Does this message contain or describe a person's Social Security Number, even if disguised, spelled out digit-by-digit, or split up?",
  },
  {
    id: 'poc-roadmap',
    prompt:
      'Does this message discuss unreleased product roadmap items, unannounced features, or internal launch dates that have not been made public?',
  },
  {
    id: 'poc-secret',
    prompt:
      'Does this message contain or describe a credential, API key, password, or access token being shared?',
  },
]
