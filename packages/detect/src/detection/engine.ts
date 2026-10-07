import type { Policy, Rule, PatternRule, EntropyRule, DictionaryRule, JudgePromptRule } from "../policy/schema";
import type { DetectionResult, DetectionInput, Finding, ShadowFinding, ScoreRule, ScoreSignalConfig } from "./types";
import { maxAction, compareSeverity } from "./types";
import { normalizeText } from "./normalize";
import { findCodeSpans, isInsideCode } from "./code-block";
import { luhnCheck, ssnCheck, ibanCheck } from "./layer1-patterns/pii";
import { findHighEntropyTokens } from "./layer1-patterns/entropy";
import { runExactDictionaryRule } from "./layer3-dictionary/exact";
import { runFuzzyDictionaryRule } from "./layer3-dictionary/fuzzy";
import { SNIPPET_CONTEXT_CHARS } from "../constants";
import type { LocalJudge } from "../judge/types";

/**
 * Rule excludes judge_prompt — runRule's switch stays exhaustive over the
 * kinds it evaluates synchronously; judge_prompt is evaluated separately,
 * in parallel, via LocalJudge (see detectPrompt).
 */
type SyncRule = Exclude<Rule, { kind: "judge_prompt" }>;

const JUDGE_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("judge timeout")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function buildSnippet(text: string, start: number, end: number): string {
  const before = text.slice(Math.max(0, start - SNIPPET_CONTEXT_CHARS), start);
  const match = text.slice(start, end);
  const after = text.slice(end, end + SNIPPET_CONTEXT_CHARS);
  return `${before}[${match}]${after}`;
}

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

export function runScoreRuleForTest(
  text: string,
  rule: ScoreRule,
  pasteDetected: boolean
): Finding[] {
  return runScoreRule(text, rule, pasteDetected);
}

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
    return [];
  }

  let match: RegExpExecArray | null;
  while ((match = re.exec(normalised)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const inside = isInsideCode(start, codeSpans);

    if (rule.scope === "inside_code" && !inside) continue;
    if (rule.scope === "outside_code" && inside) continue;

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

    if (match[0].length === 0) re.lastIndex++;
  }
  return findings;
}

function runEntropyRule(text: string, rule: EntropyRule): Finding[] {
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

function runDictionaryRule(text: string, rule: DictionaryRule): Finding[] {
  return [
    ...runExactDictionaryRule(text, rule),
    ...runFuzzyDictionaryRule(text, rule),
  ];
}

interface KindedFinding {
  finding: Finding;
  isEntropy: boolean;
  enforced: boolean;
  kind: "dictionary" | "pattern" | "entropy" | "score" | "judge_prompt";
}

/**
 * Multiple rules can independently flag the exact same substring — e.g. the
 * generic "sk-..." OpenAI API key pattern also matches "sk-proj-..." project
 * keys, and the high-entropy heuristic catches the same token again on top
 * of both. Without this, the UI shows one piece of sensitive data as N
 * separate findings. Collapse findings that share an identical
 * [startOffset, endOffset) span down to the single most severe one.
 *
 * Tie-break when severities are equal: a structural rule (pattern/
 * dictionary/score) always wins over the high-entropy heuristic — entropy
 * is a generic statistical fallback, never more specific than a rule that
 * matched actual structure. Among two structural ties (e.g. the OpenAI
 * example above), keep whichever was defined later in the rule list, since
 * this policy's convention is to list a specific rule (openai-project-key)
 * after the generic one it refines (openai-api-key).
 */
function dedupeIdenticalSpanFindings(kinded: KindedFinding[]): Finding[] {
  const bestBySpan = new Map<string, KindedFinding>();
  const spanOrder: string[] = [];
  for (const candidate of kinded) {
    const { finding } = candidate;
    const key = `${finding.startOffset}:${finding.endOffset}`;
    const current = bestBySpan.get(key);
    if (!current) {
      spanOrder.push(key);
      bestBySpan.set(key, candidate);
      continue;
    }
    const severityCmp = compareSeverity(finding.severity, current.finding.severity);
    const keepCandidate =
      severityCmp > 0 ||
      (severityCmp === 0 && current.isEntropy && !candidate.isEntropy) ||
      (severityCmp === 0 && current.isEntropy === candidate.isEntropy);
    if (keepCandidate) bestBySpan.set(key, candidate);
  }
  return spanOrder.map((key) => bestBySpan.get(key)!.finding);
}

function runRule(
  text: string,
  normalised: string,
  rule: SyncRule | ScoreRule,
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

async function runJudgePromptRules(
  text: string,
  rules: JudgePromptRule[],
  judge: LocalJudge | undefined,
): Promise<Finding[]> {
  if (!judge || rules.length === 0 || !judge.isAvailable()) return [];

  const results = await Promise.all(
    rules.map(async (rule): Promise<Finding | null> => {
      try {
        const verdict = await withTimeout(judge.classify({ text, prompt: rule.prompt }), JUDGE_TIMEOUT_MS);
        if (verdict.verdict !== "match") return null;
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          action: rule.action,
          matchedText: text.slice(0, 200),
          startOffset: 0,
          endOffset: text.length,
        };
      } catch {
        // Fail open: a broken/slow judge never blocks the user, and never
        // takes down the other rules evaluated in this same request.
        return null;
      }
    }),
  );

  return results.filter((f): f is Finding => f !== null);
}

export async function detectPrompt(
  input: DetectionInput | string,
  policy: Policy,
  hostnameOrUndefined?: string,
  pasteDetected = false,
  judge?: LocalJudge,
): Promise<DetectionResult> {
  const start = performance.now();

  let promptText: string;
  let hostname: string;
  let isFile: boolean;

  if (typeof input === "string") {
    promptText = input;
    hostname = hostnameOrUndefined ?? "";
    isFile = false;
  } else {
    promptText = input.text;
    hostname = input.hostname;
    pasteDetected = input.pasteDetected ?? false;
    isFile = input.inputType === "file";
  }

  const siteConfig = policy.perSite[hostname];
  if (siteConfig && !siteConfig.enabled) {
    return emptyResult(promptText, start);
  }

  const normalised = normalizeText(promptText);
  const codeSpans = findCodeSpans(normalised);
  const effectivePasteDetected = isFile ? false : pasteDetected;
  const allRules = [...policy.baseline, ...policy.custom];
  const syncRules = allRules.filter((r): r is SyncRule => r.kind !== "judge_prompt");
  const judgePromptRules = allRules.filter((r): r is JudgePromptRule => r.kind === "judge_prompt" && r.enabled);

  const kindedFindings: KindedFinding[] = [];
  for (const rule of syncRules) {
    const ruleFindings = runRule(promptText, normalised, rule as SyncRule | ScoreRule, codeSpans, effectivePasteDetected);
    const isEntropy = (rule as SyncRule | ScoreRule).kind === "entropy";
    for (const finding of ruleFindings) kindedFindings.push({ finding, isEntropy, enforced: rule.enforced, kind: rule.kind });
  }

  const judgeFindings = await runJudgePromptRules(promptText, judgePromptRules, judge);
  for (const finding of judgeFindings) kindedFindings.push({ finding, isEntropy: false, enforced: true, kind: "judge_prompt" });

  const enforcedKinded = kindedFindings.filter((k) => k.enforced);
  const shadowKinded = kindedFindings.filter((k) => !k.enforced);

  // dedupeIdenticalSpanFindings exists to collapse overlapping pattern/
  // entropy/dictionary matches on the same substring span — a different
  // problem from judge_prompt findings, which are distinct whole-message
  // judgments that all happen to share the same [0, text.length) span by
  // construction. Deduping those by span would silently drop every
  // judge_prompt rule but one (keeping the highest-severity rule, which
  // isn't necessarily the one with the strongest action). Dedupe only the
  // span-based kinds; every matching judge_prompt rule is its own finding.
  const spanKinded = enforcedKinded.filter((k) => k.kind !== "judge_prompt");
  const judgePromptKinded = enforcedKinded.filter((k) => k.kind === "judge_prompt");
  const findings = [...dedupeIdenticalSpanFindings(spanKinded), ...judgePromptKinded.map((k) => k.finding)];

  const shadowTimestamp = new Date().toISOString();
  // A dictionary/pattern rule can match many times in one message (a pasted
  // document full of the same keyword) — one shadow row per occurrence is
  // pure noise and risks exceeding the backend's batch cap for exactly the
  // high-signal, high-volume case telemetry most needs to see. Collapse to
  // one shadow finding per rule per request.
  const shadowByRuleId = new Map<string, KindedFinding>();
  for (const k of shadowKinded) {
    if (!shadowByRuleId.has(k.finding.ruleId)) shadowByRuleId.set(k.finding.ruleId, k);
  }
  const shadowFindings: ShadowFinding[] = Array.from(shadowByRuleId.values()).map((k) => ({
    ruleId: k.finding.ruleId,
    // shadowKinded only ever contains legacy kinds — judge_prompt rules are
    // always enforced: true (see bridge.ts), so this cast is safe.
    kind: k.kind as ShadowFinding["kind"],
    verdict: "match",
    confidence: 1,
    timestamp: shadowTimestamp,
  }));

  let highestAction: Finding["action"] = "log";
  for (const f of findings) {
    highestAction = maxAction(highestAction, f.action);
  }

  const promptHash = await sha256(normalised);
  const durationMs = performance.now() - start;

  return {
    findings,
    shadowFindings,
    highestAction,
    promptHash,
    detectedAtMs: Date.now(),
    durationMs,
  };
}

function emptyResult(_promptText: string, startPerf: number): DetectionResult {
  return {
    findings: [],
    shadowFindings: [],
    highestAction: "log",
    promptHash: "",
    detectedAtMs: Date.now(),
    durationMs: performance.now() - startPerf,
  };
}
