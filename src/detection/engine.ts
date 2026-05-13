import type { Policy, Rule, PatternRule, EntropyRule, DictionaryRule } from "@/policy/schema";
import type { DetectionResult, Finding, ScoreRule, ScoreSignalConfig } from "./types";
import { maxAction } from "./types";
import { normalizeText } from "./normalize";
import { findCodeSpans, isInsideCode } from "./code-block";
import { luhnCheck, ssnCheck, ibanCheck } from "./layer1-patterns/pii";
import { findHighEntropyTokens } from "./layer1-patterns/entropy";
import { runExactDictionaryRule } from "./layer3-dictionary/exact";
import { runFuzzyDictionaryRule } from "./layer3-dictionary/fuzzy";
import { SNIPPET_CONTEXT_CHARS } from "@/shared/constants";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** SHA-256 of a string, returned as a hex string. */
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Extract a context snippet with the match highlighted. */
export function buildSnippet(text: string, start: number, end: number): string {
  const before = text.slice(Math.max(0, start - SNIPPET_CONTEXT_CHARS), start);
  const match = text.slice(start, end);
  const after = text.slice(end, end + SNIPPET_CONTEXT_CHARS);
  return `${before}[${match}]${after}`;
}

// ─── ScoreRule helpers ────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function avgSentenceLength(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  return sentences.reduce((sum, s) => sum + countWords(s), 0) / sentences.length;
}

const SIGNAL_TESTS: Record<
  string,
  (text: string, pasteDetected: boolean, signal: ScoreSignalConfig) => boolean
> = {
  paste_detected: (_t, p) => p,
  long_text: (t, _p, s) => countWords(t) > (s.threshold ?? 400),
  legal_terms_whereas: (t) => /\b(?:WHEREAS|HEREBY)\b|IN WITNESS WHEREOF/i.test(t),
  numbered_paragraphs: (t) => /^\s*\d+\./m.test(t),
  long_avg_sentence: (t) => avgSentenceLength(t) > 25,
  formal_heading: (t) => /^[A-Z][A-Z\s]{3,}$/m.test(t),
  block_quote: (t) => /^>/m.test(t) || /^ {4}/m.test(t),
};

function runScoreRule(text: string, rule: ScoreRule, pasteDetected: boolean): Finding[] {
  if (!pasteDetected) return [];
  let score = 0;
  for (const signal of rule.signals) {
    if (!signal.enabled) continue;
    const fn = SIGNAL_TESTS[signal.id];
    if (fn && fn(text, pasteDetected, signal)) score += signal.points;
  }
  if (score < rule.warnThreshold) return [];
  const action: Finding["action"] =
    score >= rule.confirmThreshold ? rule.action : "warn";
  return [
    {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      action,
      matchedText: text.slice(0, 200),
      startOffset: 0,
      endOffset: text.length,
    },
  ];
}

/** Exported for unit testing only. */
export function runScoreRuleForTest(
  text: string,
  rule: ScoreRule,
  pasteDetected: boolean
): Finding[] {
  return runScoreRule(text, rule, pasteDetected);
}

// ─── Layer runners ────────────────────────────────────────────────────────────

function runPatternRule(
  text: string,
  normalised: string,
  rule: PatternRule,
  codeSpans: ReturnType<typeof findCodeSpans>
): Finding[] {
  const findings: Finding[] = [];
  let re: RegExp;
  try {
    re = new RegExp(rule.pattern, rule.flags.includes("g") ? rule.flags : rule.flags + "g");
  } catch {
    return []; // malformed pattern in user-supplied rule — skip gracefully
  }

  let match: RegExpExecArray | null;
  while ((match = re.exec(normalised)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const inside = isInsideCode(start, codeSpans);

    if (rule.scope === "inside_code" && !inside) continue;
    if (rule.scope === "outside_code" && inside) continue;

    // Post-match validator
    if (rule.validator === "luhn" && !luhnCheck(match[0])) continue;
    if (rule.validator === "ssn" && !ssnCheck(match[0])) continue;
    if (rule.validator === "iban" && !ibanCheck(match[0])) continue;

    findings.push({
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      action: rule.action,
      matchedText: text.slice(start, end).slice(0, 200),
      startOffset: start,
      endOffset: end,
    });

    // Guard against zero-width matches causing infinite loops
    if (match[0].length === 0) re.lastIndex++;
  }
  return findings;
}

function runEntropyRule(
  text: string,
  rule: EntropyRule
): Finding[] {
  const hits = findHighEntropyTokens(text, rule.minTokenLength, rule.minBitsPerChar);
  return hits.map(({ token, index }) => ({
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    action: rule.action,
    matchedText: token.slice(0, 200),
    startOffset: index,
    endOffset: index + token.length,
  }));
}

function runDictionaryRule(
  text: string,
  rule: DictionaryRule
): Finding[] {
  return [
    ...runExactDictionaryRule(text, rule),
    ...runFuzzyDictionaryRule(text, rule),
  ];
}

function runRule(
  text: string,
  normalised: string,
  rule: Rule | ScoreRule,
  codeSpans: ReturnType<typeof findCodeSpans>,
  pasteDetected: boolean
): Finding[] {
  if (!rule.enabled) return [];
  switch (rule.kind) {
    case "pattern":
      return runPatternRule(text, normalised, rule, codeSpans);
    case "entropy":
      return runEntropyRule(normalised, rule);
    case "dictionary":
      return runDictionaryRule(normalised, rule);
    case "score":
      return runScoreRule(text, rule, pasteDetected);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the full detection pipeline against a prompt.
 *
 * @param promptText  The raw prompt text captured from the composer.
 * @param policy      The active policy (loaded from storage).
 * @param hostname    The current site hostname (used for per-site overrides).
 */
export async function detectPrompt(
  promptText: string,
  policy: Policy,
  hostname: string,
  pasteDetected = false
): Promise<DetectionResult> {
  const start = performance.now();

  // Per-site kill switch
  const siteConfig = policy.perSite[hostname];
  if (siteConfig && !siteConfig.enabled) {
    return emptyResult(promptText, start);
  }

  const normalised = normalizeText(promptText);
  const codeSpans = findCodeSpans(normalised);
  const allRules = [...policy.baseline, ...policy.custom];

  // Run all rules — pattern + entropy are sync; we can run them all inline.
  // TODO: Layer 2 (ML NER) and Layer 4 (cloud) would be inserted here as
  // async pipeline stages, awaited after the sync layers complete.
  const findings: Finding[] = [];
  for (const rule of allRules) {
    const ruleFindings = runRule(promptText, normalised, rule as Rule | ScoreRule, codeSpans, pasteDetected);
    findings.push(...ruleFindings);
  }

  // Compute highest-severity action
  let highestAction: Finding["action"] = "log";
  for (const f of findings) {
    highestAction = maxAction(highestAction, f.action);
  }

  const promptHash = await sha256(normalised);
  const durationMs = performance.now() - start;

  return {
    findings,
    highestAction,
    promptHash,
    detectedAtMs: Date.now(),
    durationMs,
  };
}

function emptyResult(promptText: string, startPerf: number): DetectionResult {
  return {
    findings: [],
    highestAction: "log",
    promptHash: "",
    detectedAtMs: Date.now(),
    durationMs: performance.now() - startPerf,
  };
}
