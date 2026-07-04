import { describe, it, expect } from "vitest";
import { PolicySchema, PolicyDocSchema } from "../../src/policy/schema";
import { DEFAULT_POLICY } from "../../src/policy/defaults";

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

describe("PolicyDocSchema (backend API shape)", () => {
  it("parses a valid ResolvedPolicy from the backend", () => {
    const raw = {
      version: 1,
      tenantId: "tenant-uuid",
      subjects: [
        {
          id: "sub-1",
          name: "Confidential",
          rules: [
            { id: "rule-1", kind: "keyword", keywords: ["secret", "classified"], pattern: null, destinations: [], action: "block", message: null },
            { id: "rule-2", kind: "pattern", keywords: null, pattern: "sk-[A-Za-z0-9]{20,}", destinations: [], action: "warn", message: "API key detected" },
          ],
        },
      ],
      siteConfigs: {
        "app.acme.com": { inputSelector: "#chat-input", sendButtonSelector: "#send-btn" },
      },
    };
    const result = PolicyDocSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subjects[0]!.rules[0]!.kind).toBe("keyword");
      expect(result.data.siteConfigs["app.acme.com"]!.inputSelector).toBe("#chat-input");
    }
  });

  it("defaults siteConfigs to {} when absent", () => {
    const raw = { version: 1, tenantId: "x", subjects: [] };
    const result = PolicyDocSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.siteConfigs).toEqual({});
  });

  it("rejects unknown rule kind", () => {
    const raw = {
      version: 1, tenantId: "x",
      subjects: [{ id: "s", name: "S", rules: [{ id: "r", kind: "invalid", action: "warn" }] }],
    };
    expect(PolicyDocSchema.safeParse(raw).success).toBe(false);
  });

  it("defaults failMode to 'open' when absent", () => {
    const raw = { version: 1, tenantId: "x", subjects: [] };
    const result = PolicyDocSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.failMode).toBe("open");
  });

  it("accepts failMode 'open'", () => {
    const raw = { version: 1, tenantId: "x", subjects: [], failMode: "open" };
    const result = PolicyDocSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.failMode).toBe("open");
  });

  it("accepts failMode 'closed'", () => {
    const raw = { version: 1, tenantId: "x", subjects: [], failMode: "closed" };
    const result = PolicyDocSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.failMode).toBe("closed");
  });

  it("rejects invalid failMode value", () => {
    const raw = { version: 1, tenantId: "x", subjects: [], failMode: "maybe" };
    expect(PolicyDocSchema.safeParse(raw).success).toBe(false);
  });
});

describe("PolicySchema failMode", () => {
  it("defaults failMode to 'open' when absent", () => {
    const result = PolicySchema.safeParse(DEFAULT_POLICY);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.failMode).toBe("open");
  });

  it("accepts failMode 'closed'", () => {
    const result = PolicySchema.safeParse({ ...DEFAULT_POLICY, failMode: "closed" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.failMode).toBe("closed");
  });

  it("rejects invalid failMode value", () => {
    const result = PolicySchema.safeParse({ ...DEFAULT_POLICY, failMode: "partial" });
    expect(result.success).toBe(false);
  });
});
