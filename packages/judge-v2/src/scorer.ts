// Port of OnnxJudge.score_with_spans (models/judge-v2/judge/infer.py). The ONNX runtime module is injected so the
// same code runs on onnxruntime-node (desktop) and onnxruntime-web (extension).
import type * as OrtCommon from "onnxruntime-common";
import type { Scorer, ScoreOut, Span } from "./cascade";
import { causalStep, chunkSpans, messageWindows, rulesStep, type Step } from "./sequence";
import { SPAN_DIM, bestSpan, spanScores } from "./span";
import { JudgeTokenizer, type JudgeConfig } from "./tokenizer";

export type { JudgeConfig } from "./tokenizer";

export interface BackboneSpec { num_layers: number; num_kv_heads: number; head_dim: number }

export interface ModelFiles {
  /** Model bytes, or a file path (onnxruntime-node only). */
  onnx: Uint8Array | string;
  tokenizerJson: string;
  tokenizerConfigJson: string;
  config: JudgeConfig;
  backboneSpec: BackboneSpec;
}

type Ort = Pick<typeof OrtCommon, "InferenceSession" | "Tensor">;
type T = OrtCommon.Tensor;

export interface OnnxScorer extends Scorer { modelVersion: string; dispose(): void }

export function loadTokenizer(files: ModelFiles): JudgeTokenizer {
  return new JudgeTokenizer(files.tokenizerJson, files.tokenizerConfigJson, files.config);
}

function kvNames(n: number, kind: string): string[] {
  return ["k", "v"].flatMap((kv) => [...Array(n).keys()].map((i) => `${kind}_${kv}_${i}`));
}

export async function createOnnxScorer(ort: Ort, files: ModelFiles, opts: { threads?: number } = {}): Promise<OnnxScorer> {
  const cfg = files.config, spec = files.backboneSpec;
  const tok = loadTokenizer(files);
  const sessOpts: OrtCommon.InferenceSession.SessionOptions = { enableCpuMemArena: false, ...(opts.threads ? { intraOpNumThreads: opts.threads } : {}) };
  const sess = typeof files.onnx === "string"
    ? await ort.InferenceSession.create(files.onnx, sessOpts)
    : await ort.InferenceSession.create(files.onnx, sessOpts);
  const pastNames = kvNames(spec.num_layers, "past"), presentNames = kvNames(spec.num_layers, "present");

  async function run(step: Step, state: T[], needState: boolean) {
    const [s, t] = step.dims;
    const feeds: Record<string, T> = {
      input_ids: new ort.Tensor("int64", step.inputIds, [1, s]),
      position_ids: new ort.Tensor("int64", step.positionIds, [1, s]),
      attn_bias: new ort.Tensor("float32", step.attnBias, [1, 1, s, t]),
    };
    pastNames.forEach((n, i) => { feeds[n] = state[i]!; });
    const fetches = needState ? ["verdict", "span_key", "span_query", ...presentNames] : ["verdict", "span_query"];
    const out = await sess.run(feeds, fetches);
    return {
      verdict: out.verdict!.data as Float32Array,
      keys: needState ? (out.span_key!.data as Float32Array) : null,
      query: out.span_query!.data as Float32Array,
      state: needState ? presentNames.map((n) => out[n]!) : null,
    };
  }

  const empty = [...Array(2 * spec.num_layers)].map(() =>
    new ort.Tensor("float16", new Uint16Array(0), [1, spec.num_kv_heads, 0, spec.head_dim]));
  const prefix = tok.prefixIds();
  const prefixState = (await run(causalStep(prefix, 0), empty, true)).state!;

  async function scoreWithSpans(message: string, rules: string[]): Promise<ScoreOut[]> {
    if (rules.length === 0) return [];
    const ruleIds = rules.map((r) => tok.ruleIds(r));
    const msg = tok.messageIds(message);
    const offs = tok.messageOffsets(message, msg);
    const best = new Array<number>(rules.length).fill(-1);
    const spans: (Span | null)[] = new Array(rules.length).fill(null);
    for (const [a, b] of messageWindows(msg.length, cfg.max_message_tokens, cfg.window_overlap_tokens)) {
      let state = prefixState, p = prefix.length;
      const keyParts: Float32Array[] = [];
      for (const [s, e] of chunkSpans(b - a, cfg.max_chunk_tokens)) {
        const r = await run(causalStep(msg.slice(a + s, a + e), p), state, true);
        keyParts.push(r.keys!);
        state = r.state!;
        p += e - s;
      }
      const nKeys = keyParts.reduce((n, k) => n + k.length / SPAN_DIM, 0);
      const keys = new Float32Array(nKeys * SPAN_DIM);
      let o = 0;
      for (const k of keyParts) { keys.set(k, o); o += k.length; }
      const step = rulesStep(ruleIds, p);
      const { verdict, query } = await run(step, state, false);
      step.verdictIndex.forEach((vi, i) => {
        // float32 like numpy: logits are float32, divided by the float temperature, softmax over two classes.
        const z0 = Math.fround(verdict[vi * 2]! / cfg.temperature), z1 = Math.fround(verdict[vi * 2 + 1]! / cfg.temperature);
        const m = Math.max(z0, z1);
        const e0 = Math.exp(z0 - m), e1 = Math.exp(z1 - m);
        const prob = e1 / (e0 + e1);
        if (prob > best[i]!) {
          best[i] = prob;
          if (nKeys > 0 && offs) {
            const q = query.subarray(vi * 2 * SPAN_DIM, (vi + 1) * 2 * SPAN_DIM);
            const [t0, t1] = bestSpan(...spanScores(keys, nKeys, q));
            spans[i] = [offs[a + t0]![0], offs[a + t1]![1]];
          } else {
            spans[i] = null;
          }
        }
      });
    }
    return best.map((p, i) => ({ p, span: p >= 0.5 ? spans[i]! : null }));
  }

  return {
    modelVersion: cfg.model_version,
    scoreWithSpans,
    dispose: () => { void sess.release(); },
  };
}
