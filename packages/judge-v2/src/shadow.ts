// Judge v2 shadow runner: judges a message off the send path and reports content-free rows
// (docs/superpowers/specs/2026-11-11-judge-v2-shadow-mode-design.md, "Privacy contract").
// One job at a time; a bounded queue where the oldest waiting check is dropped (reported as skipped).
import type { Cascade, CascadeRule, RuleEntry } from "./cascade";

export type ShadowSurface = "extension" | "desktop";
export type PrimaryAction = "block" | "warn" | "log";
export type SecondaryVerdict = "block" | "warn" | "ok" | "pending" | "skipped" | "error" | "not_applicable";

export interface JudgeShadowRow {
  checkId: string;
  surface: ShadowSurface;
  ruleId: string;
  ruleKind: "keyword" | "pattern" | "judge_prompt";
  primaryAction: PrimaryAction | "none";
  secondaryVerdict: SecondaryVerdict;
  fastScore: number | null;
  secondScore: number | null;
  spanStart: number | null;
  spanEnd: number | null;
  messageChars: number;
  windows: number;
  latencyMs: number;
  modelVersion: string;
  occurredAt: string;
}

export interface ShadowRule { id: string; kind: "keyword" | "pattern" | "judge_prompt"; prompt?: string }
export interface PrimarySummary { actionByRuleId: Record<string, PrimaryAction> }

export interface ShadowRunnerOptions {
  surface: ShadowSurface;
  /** The loaded cascade, or null when the models are not downloaded/loaded yet. */
  getCascade: () => Promise<Cascade | null>;
  modelVersion: () => string | null;
  report: (rows: JudgeShadowRow[]) => void;
  lowMemory: () => boolean;
  now?: () => number;
  budgetMs?: number;
  maxQueue?: number;
  /** Text beyond this many characters is not judged (bounds CPU; ~12k tokens = 3 fast-model windows). */
  maxChars?: number;
}

export interface ShadowRunner {
  /** Never throws, never blocks: the check runs later, off the send path. */
  submit(text: string, rules: ShadowRule[], primary: PrimarySummary): void;
  /** Resolves once the queue is empty and nothing is running (tests, shutdown). */
  idle(): Promise<void>;
}

interface Job {
  checkId: string;
  occurredAt: string;
  text: string;
  judgeRules: CascadeRule[];
  primaryRules: ShadowRule[];
  primary: PrimarySummary;
}

const round3 = (x: number | null): number | null => (x === null ? null : Math.min(1, Math.max(0, Math.round(x * 1000) / 1000)));

function verdictOf(e: RuleEntry): SecondaryVerdict {
  if (e.violated === true) return "block";
  if (e.violated === null) return "pending";
  return e.warn ? "warn" : "ok";
}

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

export function createShadowRunner(o: ShadowRunnerOptions): ShadowRunner {
  const now = o.now ?? (() => Date.now());
  const budgetMs = o.budgetMs ?? 60_000;
  const maxQueue = o.maxQueue ?? 4;
  const maxChars = o.maxChars ?? 50_000;
  const queue: Job[] = [];
  let running: Promise<void> | null = null;

  function rows(job: Job, latencyMs: number, judged: Map<string, RuleEntry> | null, fallback: SecondaryVerdict): JudgeShadowRow[] {
    const base = { checkId: job.checkId, surface: o.surface, messageChars: job.text.length, latencyMs: Math.max(0, Math.round(latencyMs)),
                   modelVersion: o.modelVersion() ?? "none", occurredAt: job.occurredAt };
    const out: JudgeShadowRow[] = job.judgeRules.map((r) => {
      const e = judged?.get(r.id);
      return {
        ...base, ruleId: r.id, ruleKind: "judge_prompt", primaryAction: job.primary.actionByRuleId[r.id] ?? "none",
        secondaryVerdict: e ? verdictOf(e) : fallback,
        fastScore: e ? round3(e.fast_p) : null, secondScore: e ? round3(e.second_p) : null,
        spanStart: e?.span ? e.span.start : null, spanEnd: e?.span ? e.span.end : null, windows: e ? e.windows : 0,
      };
    });
    for (const r of job.primaryRules) {
      out.push({ ...base, ruleId: r.id, ruleKind: r.kind, primaryAction: job.primary.actionByRuleId[r.id]!, secondaryVerdict: "not_applicable",
                 fastScore: null, secondScore: null, spanStart: null, spanEnd: null, windows: 0 });
    }
    return out;
  }

  function emit(r: JudgeShadowRow[]): void {
    try { o.report(r); } catch { /* reporting is best-effort */ }
  }

  async function runJob(job: Job): Promise<void> {
    const t0 = now();
    if (o.lowMemory()) return emit(rows(job, now() - t0, null, "skipped"));
    let cascade: Cascade | null;
    try { cascade = await o.getCascade(); } catch { cascade = null; }
    if (!cascade) return emit(rows(job, now() - t0, null, "skipped"));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const inference = cascade.judge(job.text.slice(0, maxChars), job.judgeRules);
    try {
      const timeout = new Promise<"timeout">((res) => { timer = setTimeout(() => res("timeout"), budgetMs); });
      const out = await Promise.race([inference, timeout]);
      if (out === "timeout") {
        emit(rows(job, now() - t0, null, "pending"));
        // The model cannot be interrupted: keep the queue busy until it is done so inferences never overlap.
        await inference.catch(() => {});
        return;
      }
      emit(rows(job, now() - t0, new Map(out.rules.map((e) => [e.rule_id, e])), "error"));
    } catch {
      emit(rows(job, now() - t0, null, "error"));
    } finally {
      clearTimeout(timer);
    }
  }

  function pump(): void {
    if (running) return;
    const job = queue.shift();
    if (!job) return;
    running = runJob(job)
      .catch(() => {})
      .finally(() => { job.text = ""; running = null; pump(); });
  }

  return {
    submit(text, rules, primary) {
      try {
        const judgeRules = rules
          .filter((r) => r.kind === "judge_prompt" && typeof r.prompt === "string" && r.prompt.trim().length > 0)
          .map((r) => ({ id: r.id, text: r.prompt! }));
        if (judgeRules.length === 0) return;
        const primaryRules = rules.filter((r) => r.kind !== "judge_prompt" && r.id in primary.actionByRuleId);
        queue.push({ checkId: uuid(), occurredAt: new Date(now()).toISOString(), text, judgeRules, primaryRules, primary });
        while (queue.length > maxQueue) {
          const dropped = queue.shift()!;
          emit(rows(dropped, 0, null, "skipped"));
          dropped.text = "";
        }
        pump();
      } catch { /* never let the shadow path throw into the caller */ }
    },
    async idle() {
      while (running) await running;
    },
  };
}
