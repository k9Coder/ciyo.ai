import assert from "node:assert/strict";
import { test } from "node:test";
import { benchScenario, prefill, rulesSpans } from "./judge_steps.mjs";

class FakeTensor {
  constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; this.disposed = false; }
  dispose() { this.disposed = true; }
}
const ort = { Tensor: FakeTensor };
function fakeSession(made, seenFeeds = []) {
  return { run: async (feeds, names) => {
    seenFeeds.push(Object.keys(feeds));
    const out = {};
    const s = feeds.input_ids.dims[1];
    const size = (name) => (name === "span_key" ? s * 64 : name === "span_query" ? s * 128 : 0);
    for (const n of names) { out[n] = new FakeTensor("float32", new Float32Array(size(n)).fill(1), [1, s]); made.push(out[n]); }
    return out;
  } };
}
const input = { chunk: 2, layers: 2, kvHeads: 1, headDim: 1 };
const kv = () => Array.from({ length: 4 }, () => new FakeTensor());

test("prefill frees each superseded KV state but keeps the shared prefix and the final state", async () => {
  const made = [];
  const seen = [];
  const pre = { kv: kv(), p: 1 };
  const st = await prefill(ort, fakeSession(made, seen), input, pre, [5, 6, 7, 8, 9]);
  assert.ok(pre.kv.every((t) => !t.disposed));
  assert.ok(st.kv.length === 4 && st.kv.every((t) => !t.disposed));
  const superseded = made.filter((t) => !st.kv.includes(t));
  assert.ok(superseded.length > 0 && superseded.every((t) => t.disposed));
  assert.deepEqual(seen[0].slice(3), ["past_k_0", "past_k_1", "past_v_0", "past_v_1"]);
});

test("benchScenario frees verdict outputs and per-repetition states", async () => {
  const made = [];
  const pre = { kv: kv(), p: 1 };
  await benchScenario(ort, fakeSession(made), input, pre, { kind: "paste_then_send", messageIds: [5, 6, 7], ruleIds: [[1, 2]] }, 2);
  assert.ok(made.every((t) => t.disposed));
  assert.ok(pre.kv.every((t) => !t.disposed));
});


test("prefill concatenates span keys across chunks and frees the key tensors", async () => {
  const made = [];
  const pre = { kv: kv(), p: 1 };
  const st = await prefill(ort, fakeSession(made), input, pre, [5, 6, 7, 8, 9]);
  assert.equal(st.keys.length, 5 * 64);
  assert.ok(made.filter((t) => t.data.length === 2 * 64 || t.data.length === 64).every((t) => t.disposed));
});

test("rulesSpans picks the best start and end per rule", () => {
  const T = 4;
  const keys = new Float32Array(T * 64);
  keys[1 * 64 + 0] = 1;  // token 1 aligns with start dimension 0
  keys[3 * 64 + 1] = 1;  // token 3 aligns with end dimension 1
  const query = new Float32Array(128);
  query[0] = 5;          // start query dim 0
  query[64 + 1] = 5;     // end query dim 1
  assert.deepEqual(rulesSpans(query, keys, [0], T), [[1, 3]]);
});
