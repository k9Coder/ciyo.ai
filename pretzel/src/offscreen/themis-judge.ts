/**
 * Real on-device judge for the local-judge wiring spike (spike/local-judge-poc),
 * replacing TransformersLocalJudge (Qwen2.5-0.5B-Instruct) in the offscreen
 * document.
 *
 * Qwen proved the approach works (see transformers-judge.ts's history / commit
 * 5fe0a6d) but at a real cost: 483MB, 20-30s/call in a real offscreen WASM
 * context. Themis — a DeBERTa-v3-small classifier fine-tuned and
 * vocabulary-pruned specifically for this {text, rule} -> {verdict,
 * confidence} task (see models/themis/README.md) — is 138.8MB and ~160-210ms
 * per call, because it's a bidirectional classifier doing one forward pass
 * instead of a generative model producing tokens one at a time. Same held-out
 * accuracy class (F1 0.800) with zero generation/JSON-parsing involved.
 *
 * Model files are bundled as an extension asset (public/models/themis/),
 * not fetched from the HF Hub — Themis isn't published there, it's a local
 * research artifact. `env.localModelPath` is pointed at the extension's own
 * `models/` directory and remote loading is disabled so this never attempts
 * a network fetch.
 *
 * The exported ONNX graph has a pruned 18,899-row embedding table, but the
 * tokenizer shipped alongside it is the UNMODIFIED full DeBERTa-v3 tokenizer
 * (128,100 tokens) — its logic/merges were deliberately left untouched during
 * pruning. `vocab_remap.json`'s `old_to_new` map must be applied to token ids
 * after tokenization and before the embedding lookup, or the model reads
 * garbage rows. This mirrors prepare_vocab_pruned_backbone.py /
 * export_deberta_vp_onnx.py exactly (see models/themis/).
 *
 * `public/models/` and `public/ort/` are git-ignored (large binaries, local
 * only — same reasoning as models/themis/*.onnx in the repo root .gitignore).
 * To regenerate after a fresh checkout:
 *   mkdir -p public/models/themis/onnx public/ort
 *   cp ../models/themis/{config.json,tokenizer.json,tokenizer_config.json,vocab_remap.json} public/models/themis/
 *   cp ../models/themis/themis.onnx{,.data} public/models/themis/onnx/
 *   cp "node_modules/.pnpm/onnxruntime-web@"*"/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify."{mjs,wasm} public/ort/
 */
import { AutoTokenizer, AutoModelForSequenceClassification, Tensor, env } from "@huggingface/transformers";
import type { PreTrainedTokenizer, PreTrainedModel } from "@huggingface/transformers";
import type { JudgeInput, JudgeVerdict, LocalJudge } from "@mykka/detect";

const MODEL_DIR = "themis";
const MAX_LENGTH = 96;
// Label 1 is "match" — fixed by the training label encoding in build_dataset.py,
// verified against torch logits in export_deberta_vp_onnx.py's sanity check.
const MATCH_LABEL_INDEX = 1;

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = chrome.runtime.getURL("models/");

// transformers.js defaults the ONNX Runtime WASM binary to a jsdelivr CDN
// fetch. That's both a network dependency this spike exists to avoid and,
// separately, blocked outright by the extension's CSP (script-src 'self') —
// discovered via a real offscreen-document run, not assumed. Bundling the
// WASM runtime as an extension asset keeps model inference fully local.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = {
    mjs: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.asyncify.mjs"),
    wasm: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.asyncify.wasm"),
  };
}

interface VocabRemap {
  old_to_new: Record<string, number>;
  fallback_new_id: number;
}

let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let vocabRemap: VocabRemap | null = null;
let loadError: unknown = null;

// Kick off loading immediately on module init, same rationale as
// transformers-judge.ts: give the model a head start before the first
// DETECT roundtrip arrives from the service worker.
const loading: Promise<void> = (async () => {
  const [tok, mdl, remap] = await Promise.all([
    AutoTokenizer.from_pretrained(MODEL_DIR),
    AutoModelForSequenceClassification.from_pretrained(MODEL_DIR, {
      dtype: "fp32",
      device: "wasm",
      // The exported file is named themis.onnx/.onnx.data, not the
      // transformers.js default model[_<dtype>].onnx convention.
      model_file_name: "themis",
      session_options: {
        // `path` is matched against the location string embedded in the ONNX
        // graph (must be exactly "themis.onnx.data"); `data` is the actual
        // fetch path, which — unlike the core model file — is NOT prefixed
        // with the onnx/ subfolder automatically, so it's included here.
        externalData: [{ path: "themis.onnx.data", data: "onnx/themis.onnx.data" }],
      },
    }),
    fetch(chrome.runtime.getURL("models/themis/vocab_remap.json")).then((r) => r.json() as Promise<VocabRemap>),
  ]);
  tokenizer = tok;
  model = mdl;
  vocabRemap = remap;
})().catch((err: unknown) => {
  loadError = err;
  console.error("[local-judge-poc:offscreen] themis model load failed", err);
});

function remapIds(ids: Iterable<bigint>, remap: VocabRemap): BigInt64Array {
  const { old_to_new, fallback_new_id } = remap;
  return BigInt64Array.from(ids, (id) => {
    const mapped = old_to_new[String(id)];
    return BigInt(mapped ?? fallback_new_id);
  });
}

function softmax(xs: Float32Array): number[] {
  const max = Math.max(...xs);
  const exps = Array.from(xs, (x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export class ThemisLocalJudge implements LocalJudge {
  isAvailable(): boolean {
    return model !== null && tokenizer !== null && vocabRemap !== null;
  }

  async classify(input: JudgeInput): Promise<JudgeVerdict> {
    await loading;
    if (!model || !tokenizer || !vocabRemap) {
      throw loadError ?? new Error("themis judge model failed to load");
    }

    // Training shape: [CLS] message [SEP] rule claim [SEP] — message first,
    // rule prompt as text_pair (see build_dataset.py / export_deberta_vp_onnx.py).
    const encoded = tokenizer(input.text, {
      text_pair: input.prompt,
      padding: "max_length",
      truncation: true,
      max_length: MAX_LENGTH,
    }) as { input_ids: Tensor; attention_mask: Tensor };

    const remapped = remapIds(encoded.input_ids.data as BigInt64Array, vocabRemap);
    const inputIds = new Tensor("int64", remapped, encoded.input_ids.dims);

    const { logits } = (await model({ input_ids: inputIds, attention_mask: encoded.attention_mask })) as {
      logits: Tensor;
    };
    const probs = softmax(logits.data as Float32Array);
    const matchProb = probs[MATCH_LABEL_INDEX];

    return matchProb >= 0.5
      ? { verdict: "match", confidence: matchProb }
      : { verdict: "no_match", confidence: 1 - matchProb };
  }
}
