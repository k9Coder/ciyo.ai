import { describe, it, expect } from "vitest";
import { levenshtein } from "@/detection/layer3-dictionary/fuzzy";
import { detectPrompt } from "@/detection/engine";
import type { Policy } from "@/policy/schema";
import { DEFAULT_POLICY } from "@/policy/defaults";

function policyWithDictionary(terms: string[], fuzzy = false): Policy {
  return {
    ...DEFAULT_POLICY,
    baseline: [],
    custom: [
      {
        id: "test-dict",
        name: "Test Dictionary",
        description: "Test",
        severity: "high",
        action: "warn",
        enabled: true,
        tags: ["test"],
        kind: "dictionary",
        terms,
        fuzzyTerms: fuzzy ? terms.map((t) => ({ term: t, maxDistance: 1 })) : undefined,
        caseSensitive: false,
      },
    ],
  };
}

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns 1 for a single substitution", () => {
    expect(levenshtein("hello", "hxllo")).toBe(1);
  });

  it("returns 1 for a single insertion", () => {
    expect(levenshtein("hello", "helllo")).toBe(1);
  });

  it("returns 1 for a single deletion", () => {
    expect(levenshtein("hello", "helo")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshtein("", "hello")).toBe(5);
    expect(levenshtein("hello", "")).toBe(5);
    expect(levenshtein("", "")).toBe(0);
  });
});

describe("Exact dictionary matching", () => {
  it("fires on exact term", async () => {
    const policy = policyWithDictionary(["SECRET"]);
    const result = await detectPrompt("The SECRET is in the vault.", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("test-dict");
  });

  it("is case-insensitive", async () => {
    const policy = policyWithDictionary(["secret"]);
    const result = await detectPrompt("The SECRET is here", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
  });

  it("does not match partial word", async () => {
    const policy = policyWithDictionary(["sec"]);
    const result = await detectPrompt("security is important", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });

  it("does not fire on unrelated text", async () => {
    const policy = policyWithDictionary(["missile"]);
    const result = await detectPrompt("The cat sat on the mat.", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});

describe("Fuzzy dictionary matching", () => {
  it("fires on term with one typo", async () => {
    const policy = policyWithDictionary(["secret"], true);
    const result = await detectPrompt("The secrat is hidden", policy, "chatgpt.com");
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does not fire on term with two typos when maxDistance=1", async () => {
    const policy = policyWithDictionary(["secret"], true);
    const result = await detectPrompt("sxcrxt", policy, "chatgpt.com");
    // two substitutions — should not match
    expect(result.findings).toHaveLength(0);
  });
});
