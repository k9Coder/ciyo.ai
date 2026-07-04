import { describe, it, expect } from "vitest";
import { detectPrompt } from "../../src/detection/engine";
import { DEFAULT_POLICY } from "../../src/policy/defaults";
import corpus from "../fixtures/prompts.json";

interface CorpusEntry {
  id: string;
  text: string;
  expectedRuleIds: string[];
  shouldDetect: boolean;
}

const PRECISION_THRESHOLD = 0.8;
const RECALL_THRESHOLD = 0.8;

describe("Corpus regression test", () => {
  for (const entry of corpus as CorpusEntry[]) {
    it(`${entry.id}: ${entry.shouldDetect ? "should detect" : "should not detect"}`, async () => {
      const result = await detectPrompt(entry.text, DEFAULT_POLICY, "chatgpt.com");

      if (!entry.shouldDetect) {
        expect(result.findings).toHaveLength(0);
        return;
      }

      expect(result.findings.length).toBeGreaterThan(0);

      // For entries with expected rule IDs, verify at least one expected rule fired
      if (entry.expectedRuleIds.length > 0) {
        const firedIds = new Set(result.findings.map((f) => f.ruleId));
        const anyMatched = entry.expectedRuleIds.some((id) => firedIds.has(id));
        expect(anyMatched).toBe(true);
      }
    });
  }

  it("meets precision and recall thresholds over the full corpus", async () => {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    for (const entry of corpus as CorpusEntry[]) {
      const result = await detectPrompt(entry.text, DEFAULT_POLICY, "chatgpt.com");
      const detected = result.findings.length > 0;

      if (entry.shouldDetect && detected) truePositives++;
      else if (!entry.shouldDetect && detected) falsePositives++;
      else if (entry.shouldDetect && !detected) falseNegatives++;
    }

    const precision = truePositives / (truePositives + falsePositives);
    const recall = truePositives / (truePositives + falseNegatives);

    expect(precision).toBeGreaterThanOrEqual(PRECISION_THRESHOLD);
    expect(recall).toBeGreaterThanOrEqual(RECALL_THRESHOLD);
  });
});
