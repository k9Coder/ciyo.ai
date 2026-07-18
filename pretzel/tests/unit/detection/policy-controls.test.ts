import { describe, expect, it } from "vitest";
import { detectPrompt } from "@/detection/engine";
import type { Policy } from "@/policy/schema";

function policyWithRule(overrides: Partial<Policy["custom"][number]> = {}): Policy {
  return {
    version: 1,
    tenantId: "tenant-1",
    baseline: [],
    custom: [{
      id: "rule-1",
      name: "Test rule",
      description: "Admin message",
      severity: "medium",
      action: "warn",
      enabled: true,
      tags: [],
      kind: "dictionary",
      terms: ["SECRET"],
      caseSensitive: false,
      ...overrides,
    } as Policy["custom"][number]],
    perSite: {},
    allowSendAnywayWithReason: false,
    auditRetentionDays: 30,
  };
}

describe("policy destination and override controls", () => {
  it("treats empty destinations as all supported sites", async () => {
    const result = await detectPrompt("SECRET", policyWithRule({ destinations: [] }), "chatgpt.com");

    expect(result.findings).toHaveLength(1);
  });

  it("matches configured destinations by exact host or subdomain only", async () => {
    const policy = policyWithRule({ destinations: ["openai.com"] });

    await expect(detectPrompt("SECRET", policy, "openai.com")).resolves.toMatchObject({ findings: [expect.any(Object)] });
    await expect(detectPrompt("SECRET", policy, "chat.openai.com")).resolves.toMatchObject({ findings: [expect.any(Object)] });
    await expect(detectPrompt("SECRET", policy, "evilopenai.com")).resolves.toMatchObject({ findings: [] });
  });

  it("copies rule overrideability and message onto findings", async () => {
    const result = await detectPrompt("SECRET", policyWithRule({ isOverridable: true }), "chatgpt.com");

    expect(result.findings[0]).toMatchObject({
      isOverridable: true,
      message: "Admin message",
    });
  });
});
