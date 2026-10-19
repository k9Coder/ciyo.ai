// JS port of judge/sequence.py + the OnnxJudge step order. Spec 2 builds its TS runtime from this.
export const NEG = -1e9;

export function causalStep(ids, past) {
  const s = ids.length, t = past + s;
  const bias = new Float32Array(s * t);
  for (let i = 0; i < s; i++) for (let j = past + i + 1; j < t; j++) bias[i * t + j] = NEG;
  return { ids: BigInt64Array.from(ids, BigInt), pos: BigInt64Array.from({ length: s }, (_, i) => BigInt(past + i)), bias, s, t, verdictIndex: [] };
}

export function rulesStep(rules, past) {
  const s = rules.reduce((n, r) => n + r.length, 0), t = past + s;
  const bias = new Float32Array(s * t).fill(NEG);
  const ids = new BigInt64Array(s), pos = new BigInt64Array(s), verdictIndex = [];
  let off = 0;
  for (const r of rules) {
    for (let i = 0; i < r.length; i++) {
      const row = off + i;
      ids[row] = BigInt(r[i]); pos[row] = BigInt(past + i);
      for (let j = 0; j < past; j++) bias[row * t + j] = 0;
      for (let j = 0; j <= i; j++) bias[row * t + past + off + j] = 0;
    }
    off += r.length; verdictIndex.push(off - 1);
  }
  return { ids, pos, bias, s, t, verdictIndex };
}

export function kvNames(layers, kind) {
  const names = [];
  for (const kv of ["k", "v"]) for (let i = 0; i < layers; i++) names.push(`${kind}_${kv}_${i}`);
  return names;
}

// state.kv holds one float16 tensor per layer: all K tensors, then all V tensors (see judge/export.py).
export async function runStep(ort, sess, st, kv, needState) {
  const layers = kv.length / 2;
  const feeds = {
    input_ids: new ort.Tensor("int64", st.ids, [1, st.s]),
    position_ids: new ort.Tensor("int64", st.pos, [1, st.s]),
    attn_bias: new ort.Tensor("float32", st.bias, [1, 1, st.s, st.t]),
  };
  kvNames(layers, "past").forEach((n, i) => { feeds[n] = kv[i]; });
  const out = await sess.run(feeds, needState ? ["verdict", ...kvNames(layers, "present")] : ["verdict"]);
  return { verdict: out.verdict, kv: needState ? kvNames(layers, "present").map((n) => out[n]) : null };
}

const dispose = (kv) => kv.forEach((t) => t.dispose());

export async function prefixState(ort, sess, input) {
  const empty = () => new ort.Tensor("float16", new Uint16Array(0), [1, input.kvHeads, 0, input.headDim]);
  const kv = Array.from({ length: 2 * input.layers }, empty);
  const o = await runStep(ort, sess, causalStep(input.prefixIds, 0), kv, true);
  o.verdict.dispose();
  return { kv: o.kv, p: input.prefixIds.length };
}

export async function prefill(ort, sess, input, pre, messageIds) {
  let { kv, p } = pre;
  for (let a = 0; a < messageIds.length; a += input.chunk) {
    const ids = messageIds.slice(a, a + input.chunk);
    const o = await runStep(ort, sess, causalStep(ids, p), kv, true);
    // Free superseded KV states now; waiting for GC let them pile up past the RAM gate.
    o.verdict.dispose();
    if (kv !== pre.kv) dispose(kv);
    kv = o.kv; p += ids.length;
  }
  return { kv, p };
}

export async function benchScenario(ort, sess, input, pre, sc, reps = 3) {
  const times = [];
  const typed = sc.kind === "send_after_typing" ? await prefill(ort, sess, input, pre, sc.messageIds) : null;
  for (let i = 0; i <= reps; i++) {
    const t0 = performance.now();
    const st = typed ?? await prefill(ort, sess, input, pre, sc.messageIds);
    const out = await runStep(ort, sess, rulesStep(sc.ruleIds, st.p), st.kv, false);
    out.verdict.dispose();
    if (!typed && st.kv !== pre.kv) dispose(st.kv);
    if (i > 0) times.push(performance.now() - t0);
  }
  if (typed && typed.kv !== pre.kv) dispose(typed.kv);
  times.sort((x, y) => x - y);
  return times[Math.floor(times.length / 2)];
}
