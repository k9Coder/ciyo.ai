/**
 * Desktop-side ThemisLocalJudge for the local-judge PoC (spike/local-judge-poc).
 * Ports pretzel/src/offscreen/themis-judge.ts (the extension's verified
 * implementation, commit c37099d) to run natively via onnxruntime-node
 * instead of onnxruntime-web/WASM — same model, same tokenizer/vocab-remap
 * logic, no browser sandbox since this runs in Electron's main process.
 *
 * `resources/models/` is git-ignored (large binaries, local-only — same
 * reasoning as pretzel/public/models/, see root .gitignore). To regenerate
 * after a fresh checkout:
 *   mkdir -p resources/models/themis/onnx
 *   cp ../pretzel/public/models/themis/{config.json,tokenizer.json,tokenizer_config.json,vocab_remap.json} resources/models/themis/
 *   cp ../pretzel/public/models/themis/onnx/{themis.onnx,themis.onnx.data} resources/models/themis/onnx/
 * See models/themis/README.md for how these files were produced originally.
 */
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { app } from 'electron'
import {
  AutoTokenizer,
  AutoModelForSequenceClassification,
  Tensor,
  env as transformersEnv,
  type PreTrainedTokenizer,
  type PreTrainedModel,
} from '@huggingface/transformers'
import type { JudgeInput, JudgeVerdict, LocalJudge } from '@mykka/detect'

export function resolveModelDir(): string {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'models')
    : path.join(__dirname, '../resources/models')
  return path.join(base, 'themis')
}

export interface VocabRemap {
  old_to_new: Record<string, number>
  fallback_new_id: number
}

export function remapIds(ids: Iterable<bigint>, remap: VocabRemap): BigInt64Array {
  const { old_to_new, fallback_new_id } = remap
  return BigInt64Array.from(ids, (id) => {
    const mapped = old_to_new[String(id)]
    return BigInt(mapped ?? fallback_new_id)
  })
}

export function softmax(xs: Float32Array | number[]): number[] {
  const max = Math.max(...xs)
  const exps = Array.from(xs, (x) => Math.exp(x - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / sum)
}

const MAX_LENGTH = 96
// Label 1 is "match" — same label encoding as the extension's themis-judge.ts
// and models/themis/README.md's training recipe.
const MATCH_LABEL_INDEX = 1

let tokenizer: PreTrainedTokenizer | null = null
let model: PreTrainedModel | null = null
let vocabRemap: VocabRemap | null = null
let loadError: unknown = null

// Lazy and memoized: importing this module (which happens unconditionally
// from local-judge-poc.ts, which is always imported by proxy.ts) must not
// load the ~140MB model on every app launch regardless of whether the spike
// is enabled. Loading only starts on the first isAvailable()/classify()
// call, and every caller — concurrent or sequential — awaits the same
// in-flight promise rather than starting a second load.
let loadingPromise: Promise<void> | null = null

function ensureLoading(): Promise<void> {
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const modelDir = resolveModelDir()
    transformersEnv.allowLocalModels = true
    transformersEnv.allowRemoteModels = false
    // transformers.js string-joins localModelPath with the model id ('themis')
    // and then the filename — localModelPath must be modelDir's PARENT, not
    // modelDir itself, or 'themis' gets appended twice
    // (.../resources/models/themis/themis/tokenizer_config.json, which never
    // exists). A trailing slash matters for the join; mixed path separators on
    // Windows don't (Node's fs accepts both).
    transformersEnv.localModelPath = path.dirname(modelDir) + '/'

    const [tok, mdl, remapText] = await Promise.all([
      AutoTokenizer.from_pretrained('themis'),
      AutoModelForSequenceClassification.from_pretrained('themis', {
        dtype: 'fp32',
        device: 'cpu',
        // The exported file is named themis.onnx/.onnx.data, not the
        // transformers.js default model[_<dtype>].onnx convention.
        model_file_name: 'themis',
        session_options: {
          externalData: [{ path: 'themis.onnx.data', data: 'onnx/themis.onnx.data' }],
        },
      }),
      readFile(path.join(modelDir, 'vocab_remap.json'), 'utf8'),
    ])
    tokenizer = tok
    model = mdl
    vocabRemap = JSON.parse(remapText) as VocabRemap
  })().catch((err: unknown) => {
    loadError = err
    console.error('[local-judge-poc:desktop] themis model load failed', err)
  })

  return loadingPromise
}

export class ThemisLocalJudge implements LocalJudge {
  isAvailable(): boolean {
    // Fire-and-forget: kicks off the load on first check without blocking
    // the caller, per the LocalJudge interface contract. Returns current
    // known state — a check made right after enabling the flag legitimately
    // reports false while the load completes in the background.
    void ensureLoading()
    return model !== null && tokenizer !== null && vocabRemap !== null
  }

  async classify(input: JudgeInput): Promise<JudgeVerdict> {
    await ensureLoading()
    if (!model || !tokenizer || !vocabRemap) {
      throw loadError ?? new Error('themis judge model failed to load')
    }

    // Training shape: [CLS] message [SEP] rule claim [SEP] — message first,
    // rule prompt as text_pair.
    const encoded = tokenizer(input.text, {
      text_pair: input.prompt,
      padding: 'max_length',
      truncation: true,
      max_length: MAX_LENGTH,
    }) as { input_ids: Tensor; attention_mask: Tensor }

    const remapped = remapIds(encoded.input_ids.data as BigInt64Array, vocabRemap)
    const inputIds = new Tensor('int64', remapped, encoded.input_ids.dims)

    const { logits } = (await model({ input_ids: inputIds, attention_mask: encoded.attention_mask })) as {
      logits: Tensor
    }
    const probs = softmax(logits.data as Float32Array)
    const matchProb = probs[MATCH_LABEL_INDEX]

    return matchProb >= 0.5
      ? { verdict: 'match', confidence: matchProb }
      : { verdict: 'no_match', confidence: 1 - matchProb }
  }
}
