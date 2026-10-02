/**
 * Real on-device judge for the local-judge wiring spike (spike/local-judge-poc),
 * replacing StubLocalJudge in the offscreen document.
 *
 * Model choice (validated in a Node spike before wiring this in — see commit
 * history / plan doc, not reproduced in-repo): a generic small zero-shot NLI
 * classifier (Xenova/nli-deberta-v3-{xsmall,small,base}) produced unreliable
 * verdicts regardless of size — bigger models got NOISIER, not more accurate
 * (e.g. a benign "write me a poem" message scored 0.8-0.95 as "sharing a
 * credential"). A small *instruct* model prompted directly to output JSON
 * performed far better: onnx-community/Qwen2.5-0.5B-Instruct produced 0/21
 * parse failures and correct verdicts on the same test set, including
 * catching a spelled-out SSN that no regex could ever match — the actual
 * capability Plan B is for. Its only real cost is size (~480MB for the
 * smallest q4f16 variant) and latency (1.7-6s/call) — both acceptable here
 * since this runs in shadow mode (fire-and-forget, never blocks the user).
 *
 * `device: 'wasm'` is forced explicitly rather than left to auto-detection —
 * an offscreen document has no guaranteed GPU/WebGPU context, and silently
 * falling back to a slower/unavailable backend would be worse than a loud,
 * known-fixed choice here during the spike.
 */
import { pipeline, type TextGenerationPipeline } from "@huggingface/transformers";
import type { JudgeInput, JudgeVerdict, LocalJudge } from "@mykka/detect";

const MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";

const SYSTEM_PROMPT =
  'You are a precise content classifier. Given a RULE and a MESSAGE, decide if the MESSAGE violates the RULE. ' +
  'Respond with ONLY a JSON object on one line, nothing else: {"verdict":"match","confidence":0.9} or {"verdict":"no_match","confidence":0.1}';

let generator: TextGenerationPipeline | null = null;
let loadError: unknown = null;

// Kick off loading immediately on module init — by the time the first
// classify request arrives (after the DETECT roundtrip + message-pass from
// the service worker), the model has a head start on being ready.
const loading: Promise<void> = pipeline("text-generation", MODEL_ID, { dtype: "q4f16", device: "wasm" })
  .then((p) => {
    generator = p as TextGenerationPipeline;
  })
  .catch((err: unknown) => {
    loadError = err;
    console.error("[local-judge-poc:offscreen] model load failed", err);
  });

function parseVerdict(text: string): JudgeVerdict {
  const match = text.match(/\{[^{}]*\}/);
  if (!match) return { verdict: "no_match", confidence: 0 };
  try {
    const obj = JSON.parse(match[0]) as { verdict?: unknown; confidence?: unknown };
    const verdict = obj.verdict === "match" ? "match" : "no_match";
    const confidence = typeof obj.confidence === "number" ? obj.confidence : 0;
    return { verdict, confidence };
  } catch {
    return { verdict: "no_match", confidence: 0 };
  }
}

export class TransformersLocalJudge implements LocalJudge {
  isAvailable(): boolean {
    return generator !== null;
  }

  async classify(input: JudgeInput): Promise<JudgeVerdict> {
    await loading;
    if (!generator) {
      throw loadError ?? new Error("local judge model failed to load");
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `RULE: ${input.prompt}\nMESSAGE: ${input.text}` },
    ];

    const output = await generator(messages, {
      max_new_tokens: 30,
      do_sample: false,
      return_full_text: false,
    });

    const first = Array.isArray(output) ? output[0] : output;
    const generated = first.generated_text;
    const reply = Array.isArray(generated) ? String(generated.at(-1)?.content ?? "") : String(generated);

    return parseVerdict(reply);
  }
}
