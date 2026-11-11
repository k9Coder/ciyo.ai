// Ports of models/judge-v2/tests/test_sequence.py and test_model.py (best_span), plus the offset mapper.
import { describe, it, expect } from "vitest";
import { NEG, causalStep, rulesStep, chunkSpans, messageWindows } from "../src/sequence";
import { bestSpan, spanScores } from "../src/span";
import { tokenOffsets } from "../src/tokenizer";

const at = (b: Float32Array, cols: number, r: number, c: number) => b[r * cols + c];

describe("sequence", () => {
  it("causal step sees past and earlier tokens only", () => {
    const st = causalStep([5, 6, 7], 2);
    expect([...st.inputIds].map(Number)).toEqual([5, 6, 7]);
    expect([...st.positionIds].map(Number)).toEqual([2, 3, 4]);
    expect(st.dims).toEqual([3, 5]);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) expect(at(st.attnBias, 5, r, c)).toBe(0);
    expect(at(st.attnBias, 5, 0, 3)).toBe(NEG); expect(at(st.attnBias, 5, 0, 2)).toBe(0);
    expect(at(st.attnBias, 5, 2, 4)).toBe(0);
    expect(st.verdictIndex).toEqual([]);
  });

  it("rules step blocks are isolated", () => {
    const st = rulesStep([[1, 2], [3, 4, 5]], 10);
    expect([...st.inputIds].map(Number)).toEqual([1, 2, 3, 4, 5]);
    expect([...st.positionIds].map(Number)).toEqual([10, 11, 10, 11, 12]);
    expect(st.verdictIndex).toEqual([1, 4]);
    expect(st.dims).toEqual([5, 15]);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) expect(at(st.attnBias, 15, r, c)).toBe(0);
    expect(at(st.attnBias, 15, 1, 10)).toBe(0); expect(at(st.attnBias, 15, 1, 11)).toBe(0);
    for (let r = 2; r < 5; r++) for (let c = 10; c < 12; c++) expect(at(st.attnBias, 15, r, c)).toBe(NEG);
    for (let r = 0; r < 2; r++) for (let c = 12; c < 15; c++) expect(at(st.attnBias, 15, r, c)).toBe(NEG);
    expect(at(st.attnBias, 15, 2, 13)).toBe(NEG); expect(at(st.attnBias, 15, 4, 12)).toBe(0);
  });

  it("empty inputs throw", () => {
    expect(() => causalStep([], 0)).toThrow();
    expect(() => rulesStep([], 3)).toThrow();
    expect(() => rulesStep([[1], []], 3)).toThrow();
  });

  it("chunk spans cover exactly", () => {
    expect(chunkSpans(0, 500)).toEqual([]);
    expect(chunkSpans(1200, 500)).toEqual([[0, 500], [500, 1000], [1000, 1200]]);
    expect(chunkSpans(500, 500)).toEqual([[0, 500]]);
  });

  it("message windows: short message is one window; long ones cover every overlap-length span", () => {
    expect(messageWindows(100, 4096, 256)).toEqual([[0, 100]]);
    expect(messageWindows(0, 4096, 256)).toEqual([[0, 0]]);
    const wins = messageWindows(1000, 300, 50);
    expect(wins[0]![0]).toBe(0); expect(wins[wins.length - 1]![1]).toBe(1000);
    for (let s = 0; s < 950; s++) expect(wins.some(([a, b]) => a <= s && s + 50 <= b)).toBe(true);
  });
});

describe("span", () => {
  it("best span respects order and length", () => {
    const s = new Float32Array([0, 5, 0, 0]), e = new Float32Array([3, 0, 0, 4]);
    expect(bestSpan(s, e, 3)).toEqual([1, 3]);
    expect(bestSpan(s, e, 2)).toEqual([1, 1]);
  });

  it("span scores are key·query halves", () => {
    const keys = new Float32Array(2 * 64); keys[0] = 1; keys[64 + 1] = 2;
    const query = new Float32Array(128); query[0] = 3; query[1] = 4; query[64] = 5; query[65] = 6;
    const [st, en] = spanScores(keys, 2, query);
    expect([...st]).toEqual([3, 8]); expect([...en]).toEqual([5, 12]);
  });
});

describe("token offsets (UTF-16, whole characters, like HF fast tokenizers)", () => {
  it("byte-fallback pieces of one emoji all get the emoji's span; ▁ maps to a space", () => {
    const text = "Hi  🙂x";
    const pieces = [[..."Hi"].map((c) => c.charCodeAt(0)), [32, 32], [0xf0], [0x9f], [0x99], [0x82], [120]].map((b) => Uint8Array.from(b));
    expect(tokenOffsets(text, pieces)).toEqual([[0, 2], [2, 4], [4, 6], [4, 6], [4, 6], [4, 6], [6, 7]]);
  });

  it("returns null when the pieces do not reassemble the text", () => {
    expect(tokenOffsets("abc", [Uint8Array.from([97])])).toBeNull();
  });
});
