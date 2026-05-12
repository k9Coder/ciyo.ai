import { describe, it, expect } from "vitest";
import { PolicySchema } from "@/policy/schema";
import { DEFAULT_POLICY } from "@/policy/defaults";

describe("PolicySchema", () => {
  it("accepts the default policy", () => {
    const result = PolicySchema.safeParse(DEFAULT_POLICY);
    expect(result.success).toBe(true);
  });

  it("rejects a policy with missing version", () => {
    const bad = { ...DEFAULT_POLICY, version: undefined };
    const result = PolicySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a policy with wrong version number", () => {
    const bad = { ...DEFAULT_POLICY, version: 2 };
    const result = PolicySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a rule with invalid kind", () => {
    const bad = {
      ...DEFAULT_POLICY,
      custom: [
        {
          id: "bad",
          name: "bad",
          description: "",
          severity: "low",
          action: "log",
          enabled: true,
          tags: [],
          kind: "unknown_kind",
        },
      ],
    };
    const result = PolicySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts a valid custom pattern rule", () => {
    const policy = {
      ...DEFAULT_POLICY,
      custom: [
        {
          id: "custom-1",
          name: "Custom rule",
          description: "test",
          severity: "medium",
          action: "warn",
          enabled: true,
          tags: ["custom"],
          kind: "pattern",
          pattern: "test-\\d+",
          flags: "g",
          validator: "none",
          scope: "all",
        },
      ],
    };
    const result = PolicySchema.safeParse(policy);
    expect(result.success).toBe(true);
  });

  it("accepts a valid dictionary rule", () => {
    const policy = {
      ...DEFAULT_POLICY,
      custom: [
        {
          id: "dict-1",
          name: "Dict rule",
          description: "",
          severity: "high",
          action: "block",
          enabled: true,
          tags: [],
          kind: "dictionary",
          terms: ["foo", "bar"],
          caseSensitive: false,
        },
      ],
    };
    const result = PolicySchema.safeParse(policy);
    expect(result.success).toBe(true);
  });

  it("accepts a valid entropy rule", () => {
    const policy = {
      ...DEFAULT_POLICY,
      custom: [
        {
          id: "ent-1",
          name: "Entropy rule",
          description: "",
          severity: "medium",
          action: "warn",
          enabled: true,
          tags: [],
          kind: "entropy",
          minTokenLength: 20,
          minBitsPerChar: 3.5,
        },
      ],
    };
    const result = PolicySchema.safeParse(policy);
    expect(result.success).toBe(true);
  });
});
