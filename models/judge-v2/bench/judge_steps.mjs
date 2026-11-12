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
  const names = needState ? ["verdict", "span_key", ...kvNames(layers, "present")] : ["verdict", "span_query"];
  const out = await sess.run(feeds, names);
  return {
    verdict: out.verdict,
    spanKey: needState ? out.span_key : null,
    spanQuery: needState ? null : out.span_query,
    kv: needState ? kvNames(layers, "present").map((n) => out[n]) : null,
  };
}

export const SPAN_DIM = 64;

// Port of judge.model.best_span over dot-product scores: per rule, the (t0, t1) maximising
// start[t0] + end[t1] with t0 <= t1 < t0 + maxLen. spanQuery rows are [start query | end query].
export function rulesSpans(spanQuery, keys, verdictIndex, T, maxLen = 128) {
  return verdictIndex.map((vi) => {
    const q = spanQuery.subarray(vi * 2 * SPAN_DIM, (vi + 1) * 2 * SPAN_DIM);
    const start = new Float32Array(T), end = new Float32Array(T);
    for (let t = 0; t < T; t++) {
      let s = 0, e = 0;
      for (let d = 0; d < SPAN_DIM; d++) {
        s += keys[t * SPAN_DIM + d] * q[d];
        e += keys[t * SPAN_DIM + d] * q[SPAN_DIM + d];
      }
      start[t] = s; end[t] = e;
    }
    let best = -Infinity, arg = [0, 0];
    for (let t0 = 0; t0 < T; t0++) {
      for (let t1 = t0; t1 < Math.min(T, t0 + maxLen); t1++) {
        if (start[t0] + end[t1] > best) { best = start[t0] + end[t1]; arg = [t0, t1]; }
      }
    }
    return arg;
  });
}

const dispose = (kv) => kv.forEach((t) => t.dispose());

export async function prefixState(ort, sess, input) {
  const empty = () => new ort.Tensor("float16", new Uint16Array(0), [1, input.kvHeads, 0, input.headDim]);
  const kv = Array.from({ length: 2 * input.layers }, empty);
  const o = await runStep(ort, sess, causalStep(input.prefixIds, 0), kv, true);
  o.verdict.dispose();
  o.spanKey.dispose();
  return { kv: o.kv, p: input.prefixIds.length };
}

export async function prefill(ort, sess, input, pre, messageIds) {
  let { kv, p } = pre;
  // Span keys of every message token, kept as plain floats (T x SPAN_DIM) for the rules step.
  const keys = new Float32Array(messageIds.length * SPAN_DIM);
  for (let a = 0; a < messageIds.length; a += input.chunk) {
    const ids = messageIds.slice(a, a + input.chunk);
    const o = await runStep(ort, sess, causalStep(ids, p), kv, true);
    keys.set(o.spanKey.data.subarray(0, ids.length * SPAN_DIM), a * SPAN_DIM);
    // Free superseded KV states now; waiting for GC let them pile up past the RAM gate.
    o.verdict.dispose();
    o.spanKey.dispose();
    if (kv !== pre.kv) dispose(kv);
    kv = o.kv; p += ids.length;
  }
  return { kv, p, keys };
}

export async function benchScenario(ort, sess, input, pre, sc, reps = 3) {
  const times = [];
  const typed = sc.kind === "send_after_typing" ? await prefill(ort, sess, input, pre, sc.messageIds) : null;
  for (let i = 0; i <= reps; i++) {
    const t0 = performance.now();
    const st = typed ?? await prefill(ort, sess, input, pre, sc.messageIds);
    const out = await runStep(ort, sess, rulesStep(sc.ruleIds, st.p), st.kv, false);
    out.verdict.dispose();
    out.spanQuery.dispose();
    if (!typed && st.kv !== pre.kv) dispose(st.kv);
    if (i > 0) times.push(performance.now() - t0);
  }
  if (typed && typed.kv !== pre.kv) dispose(typed.kv);
  times.sort((x, y) => x - y);
  return times[Math.floor(times.length / 2)];
}
