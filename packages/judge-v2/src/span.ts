// Port of span_scores / best_span in models/judge-v2/judge/model.py. Arithmetic is kept in float32 (Math.fround)
// so ties break the way numpy's float32 does.

export const SPAN_DIM = 64;

/** Start and end scores of each message token. keys: [n, SPAN_DIM] row-major; query: [2 * SPAN_DIM]. */
export function spanScores(keys: Float32Array, n: number, query: Float32Array): [Float32Array, Float32Array] {
  const start = new Float32Array(n), end = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    let s = 0, e = 0;
    const o = t * SPAN_DIM;
    for (let d = 0; d < SPAN_DIM; d++) {
      s = Math.fround(s + Math.fround(keys[o + d]! * query[d]!));
      e = Math.fround(e + Math.fround(keys[o + d]! * query[SPAN_DIM + d]!));
    }
    start[t] = s; end[t] = e;
  }
  return [start, end];
}

/** (t0, t1) maximising start[t0] + end[t1] with t0 <= t1 < t0 + maxLen. First maximum wins, like np.argmax. */
export function bestSpan(start: Float32Array, end: Float32Array, maxLen = 128): [number, number] {
  let best = -Infinity, arg: [number, number] = [0, 0];
  for (let t0 = 0; t0 < start.length; t0++) {
    let j = t0;
    const stop = Math.min(end.length, t0 + maxLen);
    for (let t = t0 + 1; t < stop; t++) if (end[t]! > end[j]!) j = t;
    const v = Math.fround(start[t0]! + end[j]!);
    if (v > best) { best = v; arg = [t0, j]; }
  }
  return arg;
}
