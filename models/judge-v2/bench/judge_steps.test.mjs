import assert from "node:assert/strict";
import { test } from "node:test";
import { benchScenario, prefill } from "./judge_steps.mjs";

class FakeTensor {
  constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; this.disposed = false; }
  dispose() { this.disposed = true; }
}
const ort = { Tensor: FakeTensor };
function fakeSession(made) {
  return { run: async (feeds, names) => {
    const out = {};
    for (const n of names) { out[n] = new FakeTensor("float32", new Float32Array(0), []); made.push(out[n]); }
    return out;
  } };
}
const input = { chunk: 2, layers: 1, kvHeads: 1, headDim: 1 };

test("prefill frees each superseded KV state but keeps the shared prefix and the final state", async () => {
  const made = [];
  const pre = { pk: new FakeTensor(), pv: new FakeTensor(), p: 1 };
  const st = await prefill(ort, fakeSession(made), input, pre, [5, 6, 7, 8, 9]);
  assert.equal(pre.pk.disposed, false);
  assert.equal(st.pk.disposed, false);
  const superseded = made.filter((t) => t !== st.pk && t !== st.pv);
  assert.ok(superseded.length > 0 && superseded.every((t) => t.disposed));
});

test("benchScenario frees verdict outputs and per-repetition states", async () => {
  const made = [];
  const pre = { pk: new FakeTensor(), pv: new FakeTensor(), p: 1 };
  await benchScenario(ort, fakeSession(made), input, pre, { kind: "paste_then_send", messageIds: [5, 6, 7], ruleIds: [[1, 2]] }, 2);
  assert.ok(made.every((t) => t.disposed));
  assert.equal(pre.pk.disposed, false);
});
