// Parity with the Python OnnxJudge (judge/infer.py). Needs the model files, so it runs only when
// JUDGE_V2_MODELS points at a directory holding fast_v7/ and so_v7/ (e.g. models/judge-v2/artifacts).
// Fixtures come from models/judge-v2/scripts/dump_parity.py.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createOnnxScorer, loadTokenizer, type ModelFiles } from "../src/scorer";

const dir = process.env.JUDGE_V2_MODELS;

interface Case {
  message: string; rules: string[]; prefix_ids: number[]; message_ids: number[]; offsets: [number, number][];
  rule_ids: number[][]; results: { p: number; span: [number, number] | null }[];
}

function fixture(name: string): Case[] {
  return JSON.parse(readFileSync(path.join(__dirname, "fixtures", `parity_${name}.json`), "utf-8"));
}

async function loadDir(d: string): Promise<ModelFiles> {
  const read = (f: string) => readFileSync(path.join(d, f), "utf-8");
  return {
    onnx: path.join(d, "judge.onnx"),
    tokenizerJson: read("tokenizer.json"),
    tokenizerConfigJson: read("tokenizer_config.json"),
    config: JSON.parse(read("judge_config.json")),
    backboneSpec: JSON.parse(read("backbone_spec.json")),
  };
}

for (const name of ["fast_v7", "so_v7"]) {
  describe.skipIf(!dir)(`${name} parity with Python`, () => {
    let files: ModelFiles;
    beforeAll(async () => { files = await loadDir(path.join(dir!, name)); });

    it("tokenizer: same prefix, message, rule ids and UTF-16 offsets", () => {
      const tok = loadTokenizer(files);
      for (const c of fixture(name)) {
        expect(tok.prefixIds()).toEqual(c.prefix_ids);
        expect(tok.messageIds(c.message)).toEqual(c.message_ids);
        expect(tok.messageOffsets(c.message)).toEqual(c.offsets);
        expect(c.rules.map((r) => tok.ruleIds(r))).toEqual(c.rule_ids);
      }
    });

    it("fixtures cover the multi-window path (a message longer than max_message_tokens)", () => {
      const max = files.config.max_message_tokens;
      expect(fixture(name).filter((c) => c.message_ids.length > max).length).toBeGreaterThanOrEqual(2);
    });

    it("scores and spans match", async () => {
      const ort = await import("onnxruntime-node");
      const scorer = await createOnnxScorer(ort, files);
      expect(scorer.modelVersion).toBe(name);
      let spanMisses = 0, spans = 0;
      for (const c of fixture(name)) {
        const out = await scorer.scoreWithSpans(c.message, c.rules);
        out.forEach((o, i) => {
          const want = c.results[i]!;
          expect(Math.abs(o.p - want.p), `${c.message.slice(0, 40)} / ${c.rules[i]}`).toBeLessThan(1e-3);
          if (want.span || o.span) { spans++; if (JSON.stringify(o.span) !== JSON.stringify(want.span)) spanMisses++; }
        });
      }
      scorer.dispose?.();
      // fp16 KV and float32 dot products can flip an exact tie; allow at most one span difference per model.
      expect(spanMisses, `${spanMisses}/${spans} spans differ`).toBeLessThanOrEqual(1);
    }, 3_000_000);
  });
}
