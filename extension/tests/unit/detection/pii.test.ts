import { describe, it, expect } from "vitest";
import { luhnCheck, ssnCheck } from "@/detection/layer1-patterns/pii";
import { detectPrompt } from "@/detection/engine";
import { DEFAULT_POLICY } from "@/policy/defaults";
import type { Policy } from "@/policy/schema";

function policyWithOnly(...ids: string[]): Policy {
  return {
    ...DEFAULT_POLICY,
    baseline: DEFAULT_POLICY.baseline.map((r) => ({
      ...r,
      enabled: ids.includes(r.id),
    })),
  };
}

// ─── Luhn validator unit tests ────────────────────────────────────────────────

describe("luhnCheck", () => {
  it("accepts a valid Visa number", () => {
    expect(luhnCheck("4532015112830366")).toBe(true);
  });

  it("accepts a valid Mastercard number", () => {
    expect(luhnCheck("5425233430109903")).toBe(true);
  });

  it("rejects an invalid number (last digit off)", () => {
    expect(luhnCheck("4532015112830367")).toBe(false);
  });

  it("rejects a number where last digit is off by one", () => {
    // 4532015112830366 is valid; increment the last digit to make it invalid
    expect(luhnCheck("4532015112830361")).toBe(false);
  });

  it("ignores spaces and dashes", () => {
    expect(luhnCheck("4532-0151-1283-0366")).toBe(true);
  });
});

// ─── SSN validator unit tests ─────────────────────────────────────────────────

describe("ssnCheck", () => {
  it("accepts a valid SSN", () => {
    expect(ssnCheck("123-45-6789")).toBe(true);
  });

  it("rejects area code 000", () => {
    expect(ssnCheck("000-45-6789")).toBe(false);
  });

  it("rejects area code 666", () => {
    expect(ssnCheck("666-45-6789")).toBe(false);
  });

  it("rejects area code 900+", () => {
    expect(ssnCheck("900-45-6789")).toBe(false);
    expect(ssnCheck("999-45-6789")).toBe(false);
  });
});

// ─── Credit card detection ────────────────────────────────────────────────────

describe("Credit card detection", () => {
  const policy = policyWithOnly("credit-card");

  it("detects a valid Visa card number", async () => {
    const result = await detectPrompt("card: 4532015112830366", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("credit-card");
  });

  it("does not flag a number that fails Luhn", async () => {
    const result = await detectPrompt("not a card: 4532015112830367", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});

// ─── SSN detection ────────────────────────────────────────────────────────────

describe("SSN detection", () => {
  const policy = policyWithOnly("us-ssn");

  it("detects a valid-format SSN", async () => {
    const result = await detectPrompt("SSN: 123-45-6789", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("us-ssn");
  });

  it("does not flag 000-area SSN", async () => {
    const result = await detectPrompt("000-45-6789", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag 666-area SSN", async () => {
    const result = await detectPrompt("666-45-6789", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });

  it("does not fire on random digit sequences", async () => {
    const result = await detectPrompt("reference: 123456789", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});

// ─── Internal IP detection ────────────────────────────────────────────────────

describe("RFC1918 IP detection", () => {
  const policy = policyWithOnly("rfc1918-ip");

  it("detects 10.x.x.x", async () => {
    const result = await detectPrompt("server at 10.0.1.55", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
  });

  it("detects 192.168.x.x", async () => {
    const result = await detectPrompt("gateway is 192.168.0.1", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
  });

  it("detects 172.16-31.x.x", async () => {
    const result = await detectPrompt("172.16.254.1 is internal", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
  });

  it("does not flag public IP", async () => {
    const result = await detectPrompt("8.8.8.8", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag 172.32.x.x (not in range)", async () => {
    const result = await detectPrompt("172.32.0.1", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});
