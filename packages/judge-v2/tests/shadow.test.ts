import { describe, it, expect, vi } from "vitest";
import { createShadowRunner, type JudgeShadowRow, type ShadowRule } from "../src/shadow";
import type { Cascade, CascadeResult, CascadeRule } from "../src/cascade";

const ROW_KEYS = ["checkId", "surface", "ruleId", "ruleKind", "primaryAction", "secondaryVerdict", "fastScore", "secondScore",
  "spanStart", "spanEnd", "messageChars", "windows", "latencyMs", "modelVersion", "occurredAt"].sort();

const JP: ShadowRule = { id: "11111111-1111-4111-8111-111111111111", kind: "judge_prompt", prompt: "contains a customer list" };
const JP2: ShadowRule = { id: "22222222-2222-4222-8222-222222222222", kind: "judge_prompt", prompt: "reveals salaries" };
const KW: ShadowRule = { id: "33333333-3333-4333-8333-333333333333", kind: "keyword" };

function result(rules: CascadeRule[], over: Partial<Record<string, Partial<CascadeResult["rules"][number]>>> = {}): CascadeResult {
  return {
    violated: false, warn: false, decided_by: "second_opinion", latency_ms: 1, pending: false,
    rules: rules.map((r) => ({ rule_id: r.id, violated: false, warn: false, confidence: 0.9, span: null, fast_p: 0.1, second_p: null, windows: 0, ...over[r.id] })),
  };
}

function setup(opts: { judge?: Cascade["judge"]; cascade?: Cascade | null; lowMemory?: boolean; budgetMs?: number } = {}) {
  const reported: JudgeShadowRow[][] = [];
  const getCascade = vi.fn(async () => opts.cascade === undefined
    ? { judge: opts.judge ?? (async (_m: string, rules: CascadeRule[]) => result(rules)) }
    : opts.cascade);
  const runner = createShadowRunner({
    surface: "extension", getCascade, modelVersion: () => "fast_v7+so_v7", report: (rows) => reported.push(rows),
    lowMemory: () => opts.lowMemory ?? false, budgetMs: opts.budgetMs,
  });
  return { runner, reported, getCascade, rows: () => reported.flat() };
}

describe("shadow runner", () => {
  it("maps cascade verdicts to rows: block, warn, ok, pending", async () => {
    const judge = async (_m: string, rules: CascadeRule[]) => result(rules, {
      [JP.id]: { violated: true, fast_p: 0.97, second_p: 0.912345, windows: 2, span: { start: 3, end: 9, text: "secret" } },
      [JP2.id]: { warn: true, fast_p: 0.5, second_p: 0.75, windows: 1, span: { start: 0, end: 2, text: "ab" } },
    });
    const s = setup({ judge });
    s.runner.submit("ab secret text", [JP, JP2], { actionByRuleId: {} });
    await s.runner.idle();
    const [a, b] = s.rows();
    expect(a).toMatchObject({ ruleId: JP.id, ruleKind: "judge_prompt", primaryAction: "none", secondaryVerdict: "block",
      fastScore: 0.97, secondScore: 0.912, spanStart: 3, spanEnd: 9, windows: 2, messageChars: 14, surface: "extension", modelVersion: "fast_v7+so_v7" });
    expect(b).toMatchObject({ secondaryVerdict: "warn", spanStart: 0, spanEnd: 2 });
    expect(a!.checkId).toBe(b!.checkId);
    expect(a!.checkId).toMatch(/^[0-9a-f-]{36}$/);

    const s2 = setup({ judge: async (_m, rules) => result(rules, { [JP.id]: { violated: null, fast_p: 0.9 } }) });
    s2.runner.submit("x", [JP, JP2], { actionByRuleId: {} });
    await s2.runner.idle();
    expect(s2.rows().map((r) => r.secondaryVerdict)).toEqual(["pending", "ok"]);
  });

  it("rows carry exactly the whitelisted keys and never any message text", async () => {
    const msg = "my password is hunter2-UNIQUE";
    const judge = async (_m: string, rules: CascadeRule[]) => result(rules, { [JP.id]: { violated: true, span: { start: 15, end: 29, text: "hunter2-UNIQUE" } } });
    const s = setup({ judge });
    s.runner.submit(msg, [JP, KW], { actionByRuleId: { [KW.id]: "block" } });
    await s.runner.idle();
    expect(s.rows().length).toBe(2);
    for (const r of s.rows()) expect(Object.keys(r).sort()).toEqual(ROW_KEYS);
    expect(JSON.stringify(s.rows())).not.toContain("hunter2");
    expect(JSON.stringify(s.rows())).not.toContain("password");
  });

  it("a primary keyword hit is recorded as not_applicable with its action; judge_prompt rows carry the primary action", async () => {
    const s = setup();
    s.runner.submit("x", [JP, KW], { actionByRuleId: { [KW.id]: "warn", [JP.id]: "log" } });
    await s.runner.idle();
    const kw = s.rows().find((r) => r.ruleId === KW.id)!;
    expect(kw).toMatchObject({ ruleKind: "keyword", primaryAction: "warn", secondaryVerdict: "not_applicable", fastScore: null, secondScore: null, windows: 0 });
    expect(s.rows().find((r) => r.ruleId === JP.id)!.primaryAction).toBe("log");
  });

  it("no judge_prompt rules → no rows and the model is never loaded, even with primary hits", async () => {
    const s = setup();
    s.runner.submit("x", [KW], { actionByRuleId: { [KW.id]: "block" } });
    s.runner.submit("y", [], { actionByRuleId: {} });
    await s.runner.idle();
    expect(s.rows()).toEqual([]);
    expect(s.getCascade).not.toHaveBeenCalled();
  });

  it("judge_prompt rules without prompt text are ignored", async () => {
    const s = setup();
    s.runner.submit("x", [{ ...JP, prompt: "   " }], { actionByRuleId: {} });
    await s.runner.idle();
    expect(s.rows()).toEqual([]);
  });

  it("submit returns synchronously and never throws; a failing cascade yields error rows", async () => {
    const s = setup({ judge: async () => { throw new Error("onnx exploded"); } });
    expect(() => s.runner.submit("x", [JP], { actionByRuleId: {} })).not.toThrow();
    await s.runner.idle();
    expect(s.rows().map((r) => r.secondaryVerdict)).toEqual(["error"]);
  });

  it("a report callback that throws does not break the runner", async () => {
    const runner = createShadowRunner({ surface: "desktop", getCascade: async () => ({ judge: async (_m, r) => result(r) }),
      modelVersion: () => "v", report: () => { throw new Error("network"); }, lowMemory: () => false });
    runner.submit("x", [JP], { actionByRuleId: {} });
    runner.submit("y", [JP], { actionByRuleId: {} });
    await expect(runner.idle()).resolves.toBeUndefined();
  });

  it("model not ready → skipped rows", async () => {
    const s = setup({ cascade: null });
    s.runner.submit("x", [JP], { actionByRuleId: {} });
    await s.runner.idle();
    expect(s.rows().map((r) => r.secondaryVerdict)).toEqual(["skipped"]);
  });

  it("low memory → skipped rows, model not loaded", async () => {
    const s = setup({ lowMemory: true });
    s.runner.submit("x", [JP], { actionByRuleId: {} });
    await s.runner.idle();
    expect(s.rows().map((r) => r.secondaryVerdict)).toEqual(["skipped"]);
    expect(s.getCascade).not.toHaveBeenCalled();
  });

  it("budget exceeded → pending rows", async () => {
    const s = setup({ budgetMs: 20, judge: (_m, rules) => new Promise((r) => setTimeout(() => r(result(rules)), 60)) });
    s.runner.submit("x", [JP], { actionByRuleId: {} });
    await s.runner.idle();
    expect(s.rows().map((r) => r.secondaryVerdict)).toEqual(["pending"]);
  });

  it("burst of 10: one inference at a time, oldest queued checks dropped as skipped", async () => {
    let inFlight = 0, maxInFlight = 0, calls = 0;
    const judge = async (_m: string, rules: CascadeRule[]) => {
      inFlight++; calls++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      return result(rules);
    };
    const s = setup({ judge });
    for (let i = 0; i < 10; i++) s.runner.submit(`m${i}`, [JP], { actionByRuleId: {} });
    await s.runner.idle();
    expect(maxInFlight).toBe(1);
    expect(calls).toBe(5);
    const byCheck = new Map(s.rows().map((r) => [r.checkId, r.secondaryVerdict]));
    expect(byCheck.size).toBe(10);
    expect([...byCheck.values()].filter((v) => v === "skipped").length).toBe(5);
  });

  it("a 100 000-char message is capped at 50 000 chars before judging; messageChars keeps the real length", async () => {
    let seen = 0;
    const s = setup({ judge: async (m, rules) => { seen = m.length; return result(rules); } });
    s.runner.submit("a".repeat(100_000), [JP], { actionByRuleId: {} });
    await s.runner.idle();
    expect(seen).toBe(50_000);
    expect(s.rows()[0]!.messageChars).toBe(100_000);
  });

  it("a timed-out inference keeps the queue busy until it settles: never two inferences at once", async () => {
    let inFlight = 0, maxInFlight = 0;
    const judge = async (_m: string, rules: CascadeRule[]) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 80));
      inFlight--;
      return result(rules);
    };
    const s = setup({ budgetMs: 10, judge });
    s.runner.submit("a", [JP], { actionByRuleId: {} });
    s.runner.submit("b", [JP], { actionByRuleId: {} });
    await s.runner.idle();
    expect(maxInFlight).toBe(1);
    expect(s.rows().map((r) => r.secondaryVerdict)).toEqual(["pending", "pending"]);
  });
});
