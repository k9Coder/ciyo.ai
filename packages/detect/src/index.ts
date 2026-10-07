// Detection engine
export { detectPrompt, buildSnippet, runScoreRuleForTest } from './detection/engine'
export type { DetectionResult, DetectionInput, Finding, ShadowFinding, Action, Severity, InputType, ScoreRule, ScoreSignalConfig } from './detection/types'
export { maxAction, compareSeverity, compareAction } from './detection/types'
export { normalizeText } from './detection/normalize'
export { findCodeSpans, isInsideCode } from './detection/code-block'
export type { CodeSpan } from './detection/code-block'

// Layer 1 patterns
export { shannonEntropy, findHighEntropyTokens } from './detection/layer1-patterns/entropy'
export { luhnCheck, ssnCheck, ibanCheck } from './detection/layer1-patterns/pii'
export { isApiKeyRule, API_KEY_RULE_IDS } from './detection/layer1-patterns/api-keys'
export { isCredentialRule, CREDENTIAL_RULE_IDS } from './detection/layer1-patterns/credentials'
export { isNetworkRule, NETWORK_RULE_IDS } from './detection/layer1-patterns/network'

// Layer 3 dictionary
export { runExactDictionaryRule } from './detection/layer3-dictionary/exact'
export { runFuzzyDictionaryRule, levenshtein } from './detection/layer3-dictionary/fuzzy'

// Policy schema + types
export {
  PolicySchema, PolicyDocSchema,
  PatternRuleSchema, EntropyRuleSchema, DictionaryRuleSchema, ScoreRuleSchema, JudgePromptRuleSchema, RuleSchema,
  ResolvedRuleSchema, ResolvedSubjectSchema, SiteConfigSchema,
} from './policy/schema'
export type {
  Policy, PolicyDoc, Rule, PatternRule, EntropyRule, DictionaryRule, JudgePromptRule,
  ResolvedRule, ResolvedSubject, SiteConfigEntry,
} from './policy/schema'

// Policy logic
export { bridgePolicy } from './policy/bridge'
export { DEFAULT_POLICY } from './policy/defaults'

// Constants
export { SNIPPET_CONTEXT_CHARS } from './constants'

// Local-judge enforcement + shadow-mode telemetry. See judge/types.ts for
// the swap-friendly LocalJudge contract.
export type { JudgeInput, JudgeVerdict, LocalJudge } from './judge'
export type { ShadowVerdictPayload } from './judge'
export { toShadowVerdictPayload, StubLocalJudge } from './judge'
