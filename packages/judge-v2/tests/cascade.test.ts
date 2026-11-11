// Port of models/judge-v2/bench/cascade.test.mjs (every case), plus the fields shadow rows need.
import { describe, it, expect, vi } from "vitest";
import { createCascade, LOCKED_POLICY, type Scorer, type CascadeRule } from "../src/cascade";

type Out = Record<string, { p: number; span: [number, number] | null }>;
const fake = (out: Out): Scorer => ({ scoreWithSpans: async (_m, rules) => rules.map((r) => out[r]!) });
const RULES: CascadeRule[] = [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }];
const bands = { low: 0.1, high: 0.9 };
const byId = <T extends { rule_id: string }>(rs: T[]) => Object.fromEntries(rs.map((x) => [x.rule_id, x]));

describe("cascade (port of cascade.mjs)", () => {
  it("routes by band and rebases the second-opinion span", async () => {
    const fast = fake({ A: { p: 0.02, span: null }, B: { p: 0.97, span: [4, 8] }, C: { p: 0.5, span: [10, 14] } });
    const second = fake({ C: { p: 0.96, span: [0, 4] } });
    const r = await createCascade({ fast, second, bands }).judge("x".repeat(20), RULES);
    const by = byId(r.rules);
    expect(by.a!.violated).toBe(false); expect(by.b!.violated).toBe(true); expect(by.c!.violated).toBe(true);
    expect(r.decided_by).toBe("second_opinion"); expect(r.violated).toBe(true); expect(r.pending).toBe(false);
    expect(by.b!.span!.start).toBe(4);
  });

  it("missing second opinion marks pending, never false", async () => {
    const fast = fake({ A: { p: 0.02, span: null }, B: { p: 0.5, span: null }, C: { p: 0.03, span: null } });
    const r = await createCascade({ fast, second: null, bands }).judge("hello", RULES);
    expect(r.rules[1]!.violated).toBeNull(); expect(r.pending).toBe(true); expect(r.violated).toBe(false);
  });

  it("slow second opinion times out", async () => {
    const fast = fake({ A: { p: 0.5, span: null }, B: { p: 0.02, span: null }, C: { p: 0.02, span: null } });
    const slow: Scorer = { scoreWithSpans: () => new Promise((res) => setTimeout(() => res([{ p: 0.99, span: null }]), 300)) };
    const r = await createCascade({ fast, second: slow, bands, secondTimeoutMs: 50 }).judge("hello", RULES);
    expect(r.pending).toBe(true); expect(r.rules[0]!.violated).toBeNull();
  });

  it("violated rule may have a null span", async () => {
    const fast = fake({ A: { p: 0.97, span: null }, B: { p: 0.02, span: null }, C: { p: 0.02, span: null } });
    const r = await createCascade({ fast, second: null, bands }).judge("hello", RULES);
    expect(r.rules[0]!.violated).toBe(true); expect(r.rules[0]!.span).toBeNull();
  });

  it("empty message or no rules makes no model calls", async () => {
    const boom: Scorer = { scoreWithSpans: async () => { throw new Error("called"); } };
    expect((await createCascade({ fast: boom, second: boom, bands }).judge("", RULES)).violated).toBe(false);
    expect((await createCascade({ fast: boom, second: boom, bands }).judge("hi", [])).rules).toEqual([]);
  });

  it("UTF-16 offsets slice the exact text for emoji and Hebrew", async () => {
    const msg = "שלום 🙂 card 4539 1488 0343 6467";
    const s = msg.indexOf("4539"); const e = msg.length;
    const fast: Scorer = { scoreWithSpans: async () => [{ p: 0.97, span: [s, e] }] };
    const r = await createCascade({ fast, second: null, bands }).judge(msg, [{ id: "a", text: "A" }]);
    expect(r.rules[0]!.span!.text).toBe("4539 1488 0343 6467");
  });

  it("lazy second model loads on demand and unloads after idle", async () => {
    vi.useFakeTimers();
    try {
      let loads = 0, disposes = 0;
      const loader = async (): Promise<Scorer> => { loads += 1; return { scoreWithSpans: async () => [{ p: 0.99, span: null }], dispose: () => { disposes += 1; } }; };
      const c = createCascade({ fast: fake({ A: { p: 0.5, span: null } }), second: loader, bands, idleUnloadMs: 1000, secondTimeoutMs: 100000 });
      await c.judge("hello", [RULES[0]!]);
      vi.advanceTimersByTime(1500);
      await c.judge("hello", [RULES[0]!]);
      expect(loads).toBe(2); expect(disposes).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lazy fast model loads on demand and unloads after idle", async () => {
    vi.useFakeTimers();
    try {
      let loads = 0, disposes = 0;
      const fastLoader = async (): Promise<Scorer> => { loads += 1; return { scoreWithSpans: async (_m, rules) => rules.map(() => ({ p: 0.01, span: null })), dispose: () => { disposes += 1; } }; };
      const c = createCascade({ fast: fastLoader, second: null, bands, idleUnloadMs: 1000 });
      await c.judge("hello", [RULES[0]!]);
      await c.judge("hello", [RULES[0]!]);
      expect(loads).toBe(1);
      vi.advanceTimersByTime(1500);
      expect(disposes).toBe(1);
      await c.judge("hello", [RULES[0]!]);
      expect(loads).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("confirm policy blocks only when both models agree", async () => {
    const fast = fake({ A: { p: 0.95, span: [0, 3] }, B: { p: 0.95, span: [0, 3] }, C: { p: 0.4, span: null } });
    const second = fake({ A: { p: 0.97, span: [0, 3] }, B: { p: 0.2, span: null } });
    const r = await createCascade({ fast, second, confirm: { fastMin: 0.7, secondMin: 0.7 } }).judge("abc def", RULES);
    const by = byId(r.rules);
    expect(by.a!.violated).toBe(true); expect(by.a!.span!.text).toBe("abc");
    expect(by.b!.violated).toBe(false); expect(by.c!.violated).toBe(false);
    expect(r.violated).toBe(true); expect(r.decided_by).toBe("second_opinion");
  });

  it("confirm policy without a second model is pending", async () => {
    const fast = fake({ A: { p: 0.95, span: null }, B: { p: 0.1, span: null }, C: { p: 0.1, span: null } });
    const r = await createCascade({ fast, second: null, confirm: { fastMin: 0.7, secondMin: 0.7 } }).judge("abc", RULES);
    expect(r.rules[0]!.violated).toBeNull(); expect(r.pending).toBe(true); expect(r.violated).toBe(false);
  });

  it("confirm policy checks further windows on long messages", async () => {
    const msg = "a".repeat(2000) + "LEAK" + "b".repeat(2000);
    const calls: string[] = [];
    const second: Scorer = { scoreWithSpans: async (m) => { calls.push(m); const i = m.indexOf("LEAK");
      return [i >= 0 ? { p: 0.99, span: [i, i + 3] } : { p: 0.01, span: null }]; } };
    const fast: Scorer = { scoreWithSpans: async () => [{ p: 0.95, span: [10, 20] }] };
    const r = await createCascade({ fast, second, windowTokens: 150, maxWindows: 8, confirm: { fastMin: 0.7, secondMin: 0.7 } })
      .judge(msg, [{ id: "a", text: "A" }]);
    expect(r.rules[0]!.violated).toBe(true); expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(r.rules[0]!.span!.text).toBe("LEA");
  });

  const WARN = { fastMin: 0.7, secondMin: 0.9, warnFastMin: 0.4, warnSecondMin: 0.6 };

  it("warn tier flags rules between the warn and block thresholds", async () => {
    const fast = fake({ A: { p: 0.95, span: [0, 3] }, B: { p: 0.5, span: [0, 3] }, C: { p: 0.3, span: null }, D: { p: 0.95, span: [4, 7] } });
    const second = fake({ A: { p: 0.97, span: [0, 3] }, B: { p: 0.8, span: [0, 3] }, D: { p: 0.75, span: [4, 7] } });
    const r = await createCascade({ fast, second, confirm: WARN }).judge("abc def", [...RULES, { id: "d", text: "D" }]);
    const by = byId(r.rules);
    expect([by.a!.violated, by.a!.warn]).toEqual([true, false]);
    expect([by.b!.violated, by.b!.warn]).toEqual([false, true]); expect(by.b!.span!.text).toBe("abc");
    expect([by.c!.violated, by.c!.warn]).toEqual([false, false]); expect(by.c!.span).toBeNull();
    expect([by.d!.violated, by.d!.warn]).toEqual([false, true]); expect(by.d!.span!.text).toBe("def");
    expect(r.violated).toBe(true); expect(r.warn).toBe(true);
  });

  it("warn alone does not block; no warn tier means nothing warns", async () => {
    const fast = fake({ A: { p: 0.5, span: [0, 3] }, B: { p: 0.05, span: null }, C: { p: 0.05, span: null } });
    const r = await createCascade({ fast, second: fake({ A: { p: 0.8, span: [0, 3] } }), confirm: WARN }).judge("abc", RULES);
    expect(r.violated).toBe(false); expect(r.warn).toBe(true);
    const f2 = fake({ A: { p: 0.95, span: [0, 3] }, B: { p: 0.05, span: null }, C: { p: 0.05, span: null } });
    const r2 = await createCascade({ fast: f2, second: fake({ A: { p: 0.65, span: null } }), confirm: { fastMin: 0.7, secondMin: 0.7 } }).judge("abc", RULES);
    expect(r2.warn).toBe(false); expect(r2.rules.every((x) => x.warn === false)).toBe(true);
    const r3 = await createCascade({ fast: f2, second: null, bands }).judge("abc", RULES);
    expect(r3.warn).toBe(false);
  });

  it("pending rules do not warn; a rule below the block fast threshold stops at the first warn window", async () => {
    const p = await createCascade({ fast: fake({ A: { p: 0.95, span: null } }), second: null, confirm: WARN }).judge("abc", [RULES[0]!]);
    expect(p.pending).toBe(true); expect(p.rules[0]!.warn).toBe(false); expect(p.warn).toBe(false);
    let calls = 0;
    const s: Scorer = { scoreWithSpans: async () => { calls++; return [{ p: 0.8, span: null }]; } };
    const r = await createCascade({ fast: fake({ A: { p: 0.5, span: [0, 4] } }), second: s, windowTokens: 150, maxWindows: 3, confirm: WARN })
      .judge("LEAK" + "x".repeat(5000), [RULES[0]!]);
    expect(r.rules[0]!.warn).toBe(true); expect(calls).toBe(1);
  });

  it("windows: medium messages are fully covered; long-message extra windows add unseen text (parity with Python)", async () => {
    for (const n of [700, 1200, 1600, 1800]) {
      for (const mid of [0, Math.floor(n / 3), Math.floor(n / 2), n - 1]) {
        const marked = [...Array(n)].map((_, i) => String.fromCharCode(0x4e00 + i)).join("");
        const got = new Set<string>();
        const s: Scorer = { scoreWithSpans: async (m) => { for (const ch of m) got.add(ch); return [{ p: 0.01, span: null }]; } };
        await createCascade({ fast: fake({ A: { p: 0.95, span: [mid, mid + 1] } }), second: s, windowTokens: 150, maxWindows: 3,
                              confirm: { fastMin: 0.7, secondMin: 0.7 } }).judge(marked, [RULES[0]!]);
        expect(got.size, `n=${n} mid=${mid}`).toBe(n);
      }
    }
    const calls: string[] = [];
    const s2: Scorer = { scoreWithSpans: async (m) => { calls.push(m); return [{ p: 0.01, span: null }]; } };
    const long = [...Array(5000)].map((_, i) => String.fromCharCode(0x4e00 + i)).join("");
    await createCascade({ fast: fake({ A: { p: 0.95, span: [2500, 2510] } }), second: s2, windowTokens: 150, maxWindows: 3,
                          confirm: { fastMin: 0.7, secondMin: 0.7 } }).judge(long, [RULES[0]!]);
    expect(calls.length).toBe(3);
    const all = new Set<string>(); let total = 0;
    for (const m of calls) { for (const ch of m) all.add(ch); total += m.length; }
    expect(all.size).toBe(total);
  });
});

describe("cascade — fields shadow rows need", () => {
  it("result exposes fast_p, second_p and windows used", async () => {
    const fast = fake({ A: { p: 0.95, span: [0, 3] }, B: { p: 0.1, span: null }, C: { p: 0.95, span: null } });
    const second = fake({ A: { p: 0.97, span: [0, 3] } });
    const r = await createCascade({ fast, second, confirm: { fastMin: 0.7, secondMin: 0.7 } }).judge("abc", RULES.slice(0, 2));
    expect(r.rules[0]).toMatchObject({ fast_p: 0.95, second_p: 0.97, windows: 1 });
    expect(r.rules[1]).toMatchObject({ fast_p: 0.1, second_p: null, windows: 0 });
    const pend = await createCascade({ fast, second: null, confirm: { fastMin: 0.7, secondMin: 0.7 } }).judge("abc", [RULES[2]!]);
    expect(pend.rules[0]).toMatchObject({ violated: null, fast_p: 0.95, second_p: null });
  });

  it("LOCKED_POLICY carries the thresholds chosen on dev2", () => {
    expect(LOCKED_POLICY).toEqual({
      confirm: { fastMin: 0.85, secondMin: 0.85, warnFastMin: 0.43, warnSecondMin: 0.7 },
      windowTokens: 150, maxWindows: 3,
    });
  });
});
