// Port of models/judge-v2/judge/sequence.py: the token steps fed to the exported ONNX graph.

export const NEG = -1e9;

export interface Step {
  inputIds: BigInt64Array;
  positionIds: BigInt64Array;
  /** Row-major [rows, cols] additive attention bias. */
  attnBias: Float32Array;
  dims: [number, number];
  verdictIndex: number[];
}

function lowerTri(bias: Float32Array, cols: number, row0: number, col0: number, n: number): void {
  for (let r = 0; r < n; r++) for (let c = r + 1; c < n; c++) bias[(row0 + r) * cols + col0 + c] = NEG;
}

export function causalStep(tokenIds: number[], pastLen: number): Step {
  const s = tokenIds.length;
  if (s === 0) throw new Error("causalStep needs at least one token");
  const cols = pastLen + s;
  const bias = new Float32Array(s * cols);
  lowerTri(bias, cols, 0, pastLen, s);
  const pos = new BigInt64Array(s);
  for (let i = 0; i < s; i++) pos[i] = BigInt(pastLen + i);
  return { inputIds: BigInt64Array.from(tokenIds, BigInt), positionIds: pos, attnBias: bias, dims: [s, cols], verdictIndex: [] };
}

export function rulesStep(rules: number[][], pastLen: number): Step {
  if (rules.length === 0 || rules.some((r) => r.length === 0)) throw new Error("rulesStep needs at least one non-empty rule");
  const s = rules.reduce((n, r) => n + r.length, 0);
  const cols = pastLen + s;
  const bias = new Float32Array(s * cols).fill(NEG);
  for (let r = 0; r < s; r++) bias.fill(0, r * cols, r * cols + pastLen);
  const ids: number[] = [], pos: number[] = [], ends: number[] = [];
  let off = 0;
  for (const rule of rules) {
    const n = rule.length;
    for (let r = 0; r < n; r++) bias.fill(0, (off + r) * cols + pastLen + off, (off + r) * cols + pastLen + off + r + 1);
    ids.push(...rule);
    for (let i = 0; i < n; i++) pos.push(pastLen + i);
    off += n;
    ends.push(off - 1);
  }
  return { inputIds: BigInt64Array.from(ids, BigInt), positionIds: BigInt64Array.from(pos, BigInt), attnBias: bias, dims: [s, cols], verdictIndex: ends };
}

export function chunkSpans(n: number, maxChunk: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a < n; a += maxChunk) out.push([a, Math.min(a + maxChunk, n)]);
  return out;
}

export function messageWindows(n: number, maxLen: number, overlap: number): [number, number][] {
  if (n <= maxLen) return [[0, n]];
  const stride = maxLen - overlap;
  const starts: number[] = [];
  for (let a = 0; a < n - maxLen; a += stride) starts.push(a);
  starts.push(n - maxLen);
  return starts.map((a) => [a, a + maxLen]);
}
