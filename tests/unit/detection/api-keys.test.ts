import { describe, it, expect } from "vitest";
import { detectPrompt } from "@/detection/engine";
import { DEFAULT_POLICY } from "@/policy/defaults";
import type { Policy } from "@/policy/schema";

/** Run detection with only the named rule(s) enabled. */
function policyWithOnly(...ids: string[]): Policy {
  return {
    ...DEFAULT_POLICY,
    baseline: DEFAULT_POLICY.baseline.map((r) => ({
      ...r,
      enabled: ids.includes(r.id),
    })),
  };
}

describe("OpenAI API key detection", () => {
  const policy = policyWithOnly("openai-api-key");

  it("detects a classic sk- key", async () => {
    const result = await detectPrompt("Here is my key: sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghij", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("openai-api-key");
    expect(result.highestAction).toBe("block");
  });

  it("detects key embedded in sentence", async () => {
    const result = await detectPrompt("Please debug this: sk-aBcDeFgHiJkLmNoPqRsT123456789012", policy, "chatgpt.com");
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does not fire on short sk- prefix", async () => {
    const result = await detectPrompt("sk-short", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });

  it("does not fire on unrelated text", async () => {
    const result = await detectPrompt("How do I write a for loop in Python?", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});

describe("OpenAI project key detection", () => {
  const policy = policyWithOnly("openai-project-key");

  it("detects sk-proj- key", async () => {
    const result = await detectPrompt("key=sk-proj-ABCDEFGHIJKLMNOPQRSTUVabcdefghij", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("openai-project-key");
  });

  it("does not match plain sk- without proj-", async () => {
    const result = await detectPrompt("sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghij", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});

describe("Anthropic API key detection", () => {
  const policy = policyWithOnly("anthropic-api-key");

  it("detects sk-ant- key", async () => {
    const result = await detectPrompt("const key = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVabcde'", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
  });

  it("does not match sk-ant with insufficient length", async () => {
    const result = await detectPrompt("sk-ant-short", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});

describe("AWS access key detection", () => {
  const policy = policyWithOnly("aws-access-key");

  it("detects AKIA key", async () => {
    const result = await detectPrompt("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("aws-access-key");
  });

  it("detects ASIA key", async () => {
    const result = await detectPrompt("key: ASIAIOSFODNN7EXAMPLE1", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
  });

  it("does not match AKIA with wrong length", async () => {
    const result = await detectPrompt("AKIASHORT", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});

describe("GitHub token detection", () => {
  const policy = policyWithOnly("github-token");

  it("detects ghp_ personal access token", async () => {
    const result = await detectPrompt("token = ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJ", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
  });

  it("detects gho_ oauth token", async () => {
    const result = await detectPrompt("gho_aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJ", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
  });

  it("does not match gh without recognised prefix letter", async () => {
    const result = await detectPrompt("ghz_aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJ", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});

describe("Slack token detection", () => {
  const policy = policyWithOnly("slack-token");

  it("detects xoxb- bot token", async () => {
    const result = await detectPrompt("SLACK_TOKEN=xoxb-123456789012-123456789012-ABCDEFabcdef", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
  });

  it("detects xoxp- user token", async () => {
    const result = await detectPrompt("xoxp-12345678901-12345678901-ABCDEFGHIJ", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
  });

  it("does not match xox without valid type letter", async () => {
    const result = await detectPrompt("xoxz-12345678901", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});

describe("Google API key detection", () => {
  const policy = policyWithOnly("google-api-key");

  it("detects AIza key", async () => {
    // AIza + exactly 35 alphanum chars = valid Google API key
    const result = await detectPrompt("GOOGLE_API_KEY=AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
  });

  it("does not match AIza with wrong length", async () => {
    const result = await detectPrompt("AIzaShort", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});
