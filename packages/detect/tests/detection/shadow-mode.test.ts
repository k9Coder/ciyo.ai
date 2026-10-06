import { describe, it, expect } from "vitest";
import { detectPrompt } from "../../src/detection/engine";
import { DEFAULT_POLICY } from "../../src/policy/defaults";
import type { Policy } from "../../src/policy/schema";
import { toShadowVerdictPayload } from "../../src/judge/shadow-telemetry";
import type { ShadowFinding } from "../../src/detection/types";

function policyWithShadowDictionary(terms: string[]): Policy {
  return {
    ...DEFAULT_POLICY,
    baseline: [],
    custom: [
      {
        id: "shadow-dict-1", name: "Shadow Dict", description: "", severity: "high",
        action: "block", enabled: true, tags: [], enforced: false,
        kind: "dictionary", terms, caseSensitive: false,
      },
    ],
  };
}

function policyWithEnforcedDictionary(terms: string[]): Policy {
  return {
    ...DEFAULT_POLICY,
    baseline: [],
    custom: [
      {
        id: "enforced-dict-1", name: "Enforced Dict", description: "", severity: "high",
        action: "block", enabled: true, tags: [], enforced: true,
        kind: "dictionary", terms, caseSensitive: false,
      },
    ],
  };
}

describe("detectPrompt — shadow-mode split", () => {
  it("a shadow (enforced: false) rule match does not block, and does not appear in findings", async () => {
    const result = await detectPrompt("this has secretword in it", policyWithShadowDictionary(["secretword"]), "example.com");
    expect(result.highestAction).toBe("log");
    expect(result.findings).toHaveLength(0);
  });

  it("a shadow rule match appears in shadowFindings instead", async () => {
    const result = await detectPrompt("this has secretword in it", policyWithShadowDictionary(["secretword"]), "example.com");
    expect(result.shadowFindings).toHaveLength(1);
    expect(result.shadowFindings[0]!.ruleId).toBe("shadow-dict-1");
    expect(result.shadowFindings[0]!.kind).toBe("dictionary");
    expect(result.shadowFindings[0]!.verdict).toBe("match");
    expect(result.shadowFindings[0]!.confidence).toBe(1);
    expect(typeof result.shadowFindings[0]!.timestamp).toBe("string");
  });

  it("an enforced: true rule still blocks and feeds highestAction as before (regression check)", async () => {
    const result = await detectPrompt("this has secretword in it", policyWithEnforcedDictionary(["secretword"]), "example.com");
    expect(result.highestAction).toBe("block");
    expect(result.findings).toHaveLength(1);
    expect(result.shadowFindings).toHaveLength(0);
  });

  it("a rule with no match produces neither a finding nor a shadow finding", async () => {
    const result = await detectPrompt("nothing here", policyWithShadowDictionary(["secretword"]), "example.com");
    expect(result.findings).toHaveLength(0);
    expect(result.shadowFindings).toHaveLength(0);
  });
});

describe("toShadowVerdictPayload", () => {
  it("maps the engine-internal 'dictionary' kind to the backend-facing 'keyword' label", () => {
    const finding: ShadowFinding = {
      ruleId: "r1", kind: "dictionary", verdict: "match", confidence: 1, timestamp: "2026-10-07T00:00:00.000Z",
    };
    const payload = toShadowVerdictPayload(finding);
    expect(payload.kind).toBe("keyword");
    expect(payload.enforced).toBe(false);
    expect(payload.ruleId).toBe("r1");
    expect(payload.verdict).toBe("match");
    expect(payload.confidence).toBe(1);
    expect(payload.timestamp).toBe("2026-10-07T00:00:00.000Z");
  });

  it("passes pattern/entropy/score kinds through unchanged", () => {
    for (const kind of ["pattern", "entropy", "score"] as const) {
      const finding: ShadowFinding = { ruleId: "r2", kind, verdict: "match", confidence: 1, timestamp: "2026-10-07T00:00:00.000Z" };
      expect(toShadowVerdictPayload(finding).kind).toBe(kind);
    }
  });
});
