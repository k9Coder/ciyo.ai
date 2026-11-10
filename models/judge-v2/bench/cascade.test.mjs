import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { createCascade } from "./cascade.mjs";

const fake = (out) => ({ scoreWithSpans: async (message, rules) => rules.map((r) => out[r]) });
const RULES = [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }];
const bands = { low: 0.1, high: 0.9 };

test("routes by band and rebases the second-opinion span", async () => {
  const fast = fake({ A: { p: 0.02, span: null }, B: { p: 0.97, span: [4, 8] }, C: { p: 0.5, span: [10, 14] } });
  const second = fake({ C: { p: 0.96, span: [0, 4] } });
  const r = await createCascade({ fast, second, bands }).judge("x".repeat(20), RULES);
  const by = Object.fromEntries(r.rules.map((x) => [x.rule_id, x]));
  assert.equal(by.a.violated, false); assert.equal(by.b.violated, true); assert.equal(by.c.violated, true);
  assert.equal(r.decided_by, "second_opinion"); assert.equal(r.violated, true); assert.equal(r.pending, false);
  assert.equal(by.b.span.start, 4);
});

test("missing second opinion marks pending, never false", async () => {
  const fast = fake({ A: { p: 0.02, span: null }, B: { p: 0.5, span: null }, C: { p: 0.03, span: null } });
  const r = await createCascade({ fast, second: null, bands }).judge("hello", RULES);
  assert.equal(r.rules[1].violated, null); assert.equal(r.pending, true); assert.equal(r.violated, false);
});

test("slow second opinion times out", async () => {
  const fast = fake({ A: { p: 0.5, span: null }, B: { p: 0.02, span: null }, C: { p: 0.02, span: null } });
  const slow = { scoreWithSpans: () => new Promise((res) => setTimeout(() => res([{ p: 0.99, span: null }]), 300)) };
  const r = await createCascade({ fast, second: slow, bands, secondTimeoutMs: 50 }).judge("hello", RULES);
  assert.equal(r.pending, true); assert.equal(r.rules[0].violated, null);
});

test("violated rule may have a null span", async () => {
  const fast = fake({ A: { p: 0.97, span: null }, B: { p: 0.02, span: null }, C: { p: 0.02, span: null } });
  const r = await createCascade({ fast, second: null, bands }).judge("hello", RULES);
  assert.equal(r.rules[0].violated, true); assert.equal(r.rules[0].span, null);
});

test("empty message or no rules makes no model calls", async () => {
  const boom = { scoreWithSpans: async () => { throw new Error("called"); } };
  assert.equal((await createCascade({ fast: boom, second: boom, bands }).judge("", RULES)).violated, false);
  assert.deepEqual((await createCascade({ fast: boom, second: boom, bands }).judge("hi", [])).rules, []);
});

test("UTF-16 offsets slice the exact text for emoji and Hebrew", async () => {
  const msg = "שלום 🙂 card 4539 1488 0343 6467";
  const s = msg.indexOf("4539"); const e = msg.length;
  const fast = { scoreWithSpans: async () => [{ p: 0.97, span: [s, e] }] };
  const r = await createCascade({ fast, second: null, bands }).judge(msg, [{ id: "a", text: "A" }]);
  assert.equal(r.rules[0].span.text, "4539 1488 0343 6467");
});

test("lazy second model loads on demand and unloads after idle", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let loads = 0, disposes = 0;
  const loader = async () => { loads += 1; return { scoreWithSpans: async () => [{ p: 0.99, span: null }], dispose: () => { disposes += 1; } }; };
  const fast = fake({ A: { p: 0.5, span: null } });
  const c = createCascade({ fast, second: loader, bands, idleUnloadMs: 1000, secondTimeoutMs: 100000 });
  await c.judge("hello", [RULES[0]]);
  mock.timers.tick(1500);
  await c.judge("hello", [RULES[0]]);
  mock.timers.reset();
  assert.equal(loads, 2); assert.equal(disposes, 1);
});

test("confirm policy blocks only when both models agree", async () => {
  const fast = fake({ A: { p: 0.95, span: [0, 3] }, B: { p: 0.95, span: [0, 3] }, C: { p: 0.4, span: null } });
  const second = fake({ A: { p: 0.97, span: [0, 3] }, B: { p: 0.2, span: null } });
  const r = await createCascade({ fast, second, confirm: { fastMin: 0.7, secondMin: 0.7 } }).judge("abc def", RULES);
  const by = Object.fromEntries(r.rules.map((x) => [x.rule_id, x]));
  assert.equal(by.a.violated, true); assert.equal(by.a.span.text, "abc");
  assert.equal(by.b.violated, false); assert.equal(by.c.violated, false);
  assert.equal(r.violated, true); assert.equal(r.decided_by, "second_opinion");
});

test("confirm policy without a second model is pending", async () => {
  const fast = fake({ A: { p: 0.95, span: null }, B: { p: 0.1, span: null }, C: { p: 0.1, span: null } });
  const r = await createCascade({ fast, second: null, confirm: { fastMin: 0.7, secondMin: 0.7 } }).judge("abc", RULES);
  assert.equal(r.rules[0].violated, null); assert.equal(r.pending, true); assert.equal(r.violated, false);
});

test("confirm policy checks further windows on long messages", async () => {
  const msg = "a".repeat(2000) + "LEAK" + "b".repeat(2000);
  const calls = [];
  const second = { scoreWithSpans: async (m) => { calls.push(m); const i = m.indexOf("LEAK");
    return [i >= 0 ? { p: 0.99, span: [i, i + 3] } : { p: 0.01, span: null }]; } };
  const fast = { scoreWithSpans: async () => [{ p: 0.95, span: [10, 20] }] };
  const r = await createCascade({ fast, second, windowTokens: 150, maxWindows: 8, confirm: { fastMin: 0.7, secondMin: 0.7 } })
    .judge(msg, [{ id: "a", text: "A" }]);
  assert.equal(r.rules[0].violated, true); assert.ok(calls.length >= 2);
  assert.equal(r.rules[0].span.text, "LEA");
});

const WARN = { fastMin: 0.7, secondMin: 0.9, warnFastMin: 0.4, warnSecondMin: 0.6 };

test("warn tier flags rules between the warn and block thresholds", async () => {
  const fast = fake({ A: { p: 0.95, span: [0, 3] }, B: { p: 0.5, span: [0, 3] }, C: { p: 0.3, span: null }, D: { p: 0.95, span: [4, 7] } });
  const second = fake({ A: { p: 0.97, span: [0, 3] }, B: { p: 0.8, span: [0, 3] }, D: { p: 0.75, span: [4, 7] } });
  const rules = [...RULES, { id: "d", text: "D" }];
  const r = await createCascade({ fast, second, confirm: WARN }).judge("abc def", rules);
  const by = Object.fromEntries(r.rules.map((x) => [x.rule_id, x]));
  assert.deepEqual([by.a.violated, by.a.warn], [true, false]);
  assert.deepEqual([by.b.violated, by.b.warn], [false, true]); assert.equal(by.b.span.text, "abc");
  assert.deepEqual([by.c.violated, by.c.warn], [false, false]); assert.equal(by.c.span, null);
  assert.deepEqual([by.d.violated, by.d.warn], [false, true]); assert.equal(by.d.span.text, "def");
  assert.equal(r.violated, true); assert.equal(r.warn, true);
});

test("warn alone does not block; no warn tier means nothing warns", async () => {
  const fast = fake({ A: { p: 0.5, span: [0, 3] }, B: { p: 0.05, span: null }, C: { p: 0.05, span: null } });
  const r = await createCascade({ fast, second: fake({ A: { p: 0.8, span: [0, 3] } }), confirm: WARN }).judge("abc", RULES);
  assert.equal(r.violated, false); assert.equal(r.warn, true);
  const f2 = fake({ A: { p: 0.95, span: [0, 3] }, B: { p: 0.05, span: null }, C: { p: 0.05, span: null } });
  const r2 = await createCascade({ fast: f2, second: fake({ A: { p: 0.65, span: null } }), confirm: { fastMin: 0.7, secondMin: 0.7 } }).judge("abc", RULES);
  assert.equal(r2.warn, false); assert.ok(r2.rules.every((x) => x.warn === false));
  const r3 = await createCascade({ fast: f2, second: null, bands }).judge("abc", RULES);
  assert.equal(r3.warn, false);
});

test("pending rules do not warn; a rule below the block fast threshold stops at the first warn window", async () => {
  const p = await createCascade({ fast: fake({ A: { p: 0.95, span: null } }), second: null, confirm: WARN }).judge("abc", [RULES[0]]);
  assert.equal(p.pending, true); assert.equal(p.rules[0].warn, false); assert.equal(p.warn, false);
  let calls = 0;
  const s = { scoreWithSpans: async () => { calls++; return [{ p: 0.8, span: null }]; } };
  const r = await createCascade({ fast: fake({ A: { p: 0.5, span: [0, 4] } }), second: s, windowTokens: 150, maxWindows: 3, confirm: WARN })
    .judge("LEAK" + "x".repeat(5000), [RULES[0]]);
  assert.equal(r.rules[0].warn, true); assert.equal(calls, 1);
});
