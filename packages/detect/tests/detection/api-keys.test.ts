import { describe, it, expect } from "vitest";
import { detectPrompt } from "../../src/detection/engine";
import { DEFAULT_POLICY } from "../../src/policy/defaults";
import type { Policy } from "../../src/policy/schema";

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

describe("overlapping-rule dedup (regression: qa-fleet 20260806-195613)", () => {
  // A single sk-proj- key used to surface as 3 separate findings — the
  // generic openai-api-key pattern, the more specific openai-project-key
  // pattern, and the high-entropy-token heuristic all matched the exact
  // same span, and each rendered as its own card in the block modal.
  it("collapses an sk-proj- key matched by 3 rules into a single finding", async () => {
    const result = await detectPrompt(
      "Here is my API key: sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCD",
      DEFAULT_POLICY,
      "chatgpt.com"
    );
    const keyFindings = result.findings.filter(
      (f) => f.matchedText === "sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCD"
    );
    expect(keyFindings).toHaveLength(1);
    // The more specific pattern rule wins over both the generic pattern
    // rule and the entropy heuristic on this identical-span tie.
    expect(keyFindings[0]!.ruleId).toBe("openai-project-key");
  });

  it("still reports the SSN as a separate finding alongside the deduped key", async () => {
    const result = await detectPrompt(
      "Here is my API key: sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCD and my SSN is 123-45-6789",
      DEFAULT_POLICY,
      "chatgpt.com"
    );
    const ruleIds = new Set(result.findings.map((f) => f.ruleId));
    expect(ruleIds.has("openai-project-key")).toBe(true);
    expect(ruleIds.has("openai-api-key")).toBe(false);
    expect(ruleIds.has("high-entropy-token")).toBe(false);
    expect(result.findings.some((f) => f.matchedText.includes("123-45-6789"))).toBe(true);
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

describe("Stripe live secret key detection", () => {
  const policy = policyWithOnly("stripe-live-secret-key");

  it("detects sk_live_ key", async () => {
    const result = await detectPrompt(
      "STRIPE_KEY=sk_live_AbCdEfGhIjKlMnOpQrStUvWx",
      policy,
      "chatgpt.com"
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("stripe-live-secret-key");
  });

  it("does not match sk_test_ keys (test keys)", async () => {
    const result = await detectPrompt(
      "sk_test_AbCdEfGhIjKlMnOpQrStUvWx",
      policy,
      "chatgpt.com"
    );
    expect(result.findings).toHaveLength(0);
  });

  it("does not match short sk_live_ values", async () => {
    const result = await detectPrompt("sk_live_short", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});

describe("HuggingFace token detection", () => {
  const policy = policyWithOnly("huggingface-token");

  it("detects hf_ token", async () => {
    const result = await detectPrompt(
      "HF_TOKEN=hf_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh",
      policy,
      "chatgpt.com"
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("huggingface-token");
  });

  it("does not match short hf_ values", async () => {
    const result = await detectPrompt("hf_tooshort", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});

describe("npm token detection", () => {
  const policy = policyWithOnly("npm-token");

  it("detects npm_ token", async () => {
    const result = await detectPrompt(
      "NPM_TOKEN=npm_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij",
      policy,
      "chatgpt.com"
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("npm-token");
  });

  it("does not match short npm_ values", async () => {
    const result = await detectPrompt("npm_short", policy, "chatgpt.com");
    expect(result.findings).toHaveLength(0);
  });
});

describe("Database connection string detection", () => {
  const policy = policyWithOnly("db-connection-string");

  it("detects postgresql connection string with embedded credentials", async () => {
    const result = await detectPrompt(
      "postgresql://admin:SuperSecret123@prod-db.internal:5432/customers",
      policy,
      "chatgpt.com"
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("db-connection-string");
  });

  it("detects mysql connection string", async () => {
    const result = await detectPrompt(
      "mysql://user:password123@db.example.com/mydb",
      policy,
      "chatgpt.com"
    );
    expect(result.findings).toHaveLength(1);
  });

  it("detects mongodb connection string", async () => {
    const result = await detectPrompt(
      "mongodb://admin:secretpass@mongo-host:27017/prod",
      policy,
      "chatgpt.com"
    );
    expect(result.findings).toHaveLength(1);
  });

  it("does not flag URLs without credentials", async () => {
    const result = await detectPrompt(
      "https://api.example.com/v1/users",
      policy,
      "chatgpt.com"
    );
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag URLs with too-short passwords", async () => {
    const result = await detectPrompt(
      "postgresql://user:abc@host/db",
      policy,
      "chatgpt.com"
    );
    expect(result.findings).toHaveLength(0);
  });
});

describe("Unicode bypass prevention (normalize)", () => {
  const policy = policyWithOnly("openai-api-key");

  it("detects fullwidth-encoded OpenAI key (ｓｋ- bypass attempt)", async () => {
    // Fullwidth 'sk-' characters: ｓｋ－ should normalize to 'sk-'
    // Using actual fullwidth chars: ｓ=U+FF53, ｋ=U+FF4B, ／=U+FF0F (not valid), use ｓｋ-
    const fullwidthPrefix = "ｓｋ-"; // ｓｋ-
    const key = fullwidthPrefix + "ABCDEFGHIJKLMNOPQRSTUVabcdefghij";
    const result = await detectPrompt(key, policy, "chatgpt.com");
    expect(result.findings).toHaveLength(1);
  });
});
