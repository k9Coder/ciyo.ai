import { describe, it, expect } from "vitest";
import { shannonEntropy, findHighEntropyTokens } from "../../src/detection/layer1-patterns/entropy";
import { detectPrompt } from "../../src/detection/engine";
import { DEFAULT_POLICY } from "../../src/policy/defaults";
import type { Policy } from "../../src/policy/schema";

function policyWithOnly(...ids: string[]): Policy {
  return {
    ...DEFAULT_POLICY,
    baseline: DEFAULT_POLICY.baseline.map((r) => ({
      ...r,
      enabled: ids.includes(r.id),
    })),
  };
}

describe("shannonEntropy", () => {
  it("returns 0 for empty string", () => {
    expect(shannonEntropy("")).toBe(0);
  });

  it("returns 0 for single-char repeated string", () => {
    expect(shannonEntropy("aaaaaaaaaa")).toBe(0);
  });

  it("returns ~1 for a string with two equally-likely chars", () => {
    expect(shannonEntropy("ababababab")).toBeCloseTo(1, 1);
  });

  it("returns higher entropy for more varied string", () => {
    const low = shannonEntropy("aaabbbccc");
    const high = shannonEntropy("abcdefghij");
    expect(high).toBeGreaterThan(low);
  });

  it("typical API key has high entropy", () => {
    // A real OpenAI sk- key prefix stripped
    const e = shannonEntropy("ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmn");
    expect(e).toBeGreaterThan(4.0);
  });
});

describe("findHighEntropyTokens", () => {
  it("returns high-entropy long tokens that contain both alpha and numeric chars", () => {
    const tokens = findHighEntropyTokens(
      "normal text ABCDEFGHIJKLMNOPQRSTUVabcdefghij1234 more text",
      24,
      4.0
    );
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("ignores short tokens", () => {
    const tokens = findHighEntropyTokens("ABC xyz", 24, 4.0);
    expect(tokens).toHaveLength(0);
  });

  it("ignores low-entropy long tokens", () => {
    const tokens = findHighEntropyTokens("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 24, 4.0);
    expect(tokens).toHaveLength(0);
  });

  it("does not flag all-alpha tokens (CamelCase identifiers)", () => {
    // Long CamelCase function names have no digits so charset diversity fails
    const tokens = findHighEntropyTokens(
      "calculateCompoundInterestRateForAnnuityPayments",
      24,
      4.0
    );
    expect(tokens).toHaveLength(0);
  });

  it("does not flag UUID tokens", () => {
    // UUIDs have high entropy but should be allowlisted
    const tokens = findHighEntropyTokens(
      "550e8400e29b41d4a716446655440000", // UUID hex without hyphens, 32 chars
      24,
      4.0
    );
    expect(tokens).toHaveLength(0);
  });

  it("flags a realistic API key token (alphanumeric, high entropy)", () => {
    // Simulated 32-char API token with mixed case + digits
    const tokens = findHighEntropyTokens(
      "xK8mP2nQ7vR4sT9yW1zA3bC5dE6fG0hJ",
      24,
      4.5
    );
    expect(tokens.length).toBeGreaterThan(0);
  });
});

describe("Entropy rule integration", () => {
  const policy = policyWithOnly("high-entropy-token");

  it("flags a long high-entropy string", async () => {
    const result = await detectPrompt(
      "Here is my secret: xK8mP2nQ7vR4sT9yW1zA3bC5dE6fG0hJ",
      policy,
      "chatgpt.com"
    );
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does not flag ordinary prose", async () => {
    const result = await detectPrompt(
      "The quick brown fox jumps over the lazy dog",
      policy,
      "chatgpt.com"
    );
    expect(result.findings).toHaveLength(0);
  });
});
