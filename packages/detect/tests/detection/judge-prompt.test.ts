import { describe, it, expect } from "vitest";
import { detectPrompt } from "../../src/detection/engine";
import { DEFAULT_POLICY } from "../../src/policy/defaults";
import type { Policy } from "../../src/policy/schema";
import type { JudgeInput, JudgeVerdict, LocalJudge } from "../../src/judge/types";

function policyWithJudgePrompt(prompt: string, action: "warn" | "block" = "block"): Policy {
  return {
    ...DEFAULT_POLICY,
    baseline: [],
    custom: [
      {
        id: "jp-1", name: "Judge rule", description: "", severity: "high",
        action, enabled: true, tags: [], enforced: true,
        kind: "judge_prompt", prompt,
      },
    ],
  };
}

class FakeJudge implements LocalJudge {
  constructor(
    private readonly verdict: JudgeVerdict,
    private readonly available = true,
    private readonly delayMs = 0,
    private readonly shouldThrow = false,
  ) {}
  isAvailable(): boolean { return this.available; }
  async classify(_input: JudgeInput): Promise<JudgeVerdict> {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.shouldThrow) throw new Error("judge failed");
    return this.verdict;
  }
}

describe("detectPrompt — judge_prompt enforcement", () => {
  it("blocks when the judge returns a match verdict", async () => {
    const policy = policyWithJudgePrompt("Does this contain a secret?", "block");
    const judge = new FakeJudge({ verdict: "match", confidence: 0.9 });
    const result = await detectPrompt("this is a secret", policy, "example.com", false, judge);
    expect(result.highestAction).toBe("block");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("jp-1");
  });

  it("does not block when the judge returns no_match", async () => {
    const policy = policyWithJudgePrompt("Does this contain a secret?", "block");
    const judge = new FakeJudge({ verdict: "no_match", confidence: 0.9 });
    const result = await detectPrompt("nothing interesting", policy, "example.com", false, judge);
    expect(result.highestAction).toBe("log");
    expect(result.findings).toHaveLength(0);
  });

  it("fails open silently when the judge is unavailable", async () => {
    const policy = policyWithJudgePrompt("Does this contain a secret?", "block");
    const judge = new FakeJudge({ verdict: "match", confidence: 0.9 }, false);
    const result = await detectPrompt("this is a secret", policy, "example.com", false, judge);
    expect(result.highestAction).toBe("log");
    expect(result.findings).toHaveLength(0);
  });

  it("fails open silently when classify() throws, without affecting other rules", async () => {
    const policy: Policy = {
      ...policyWithJudgePrompt("Does this contain a secret?", "block"),
      custom: [
        ...policyWithJudgePrompt("x", "block").custom,
        {
          id: "dict-1", name: "Dict", description: "", severity: "medium",
          action: "warn", enabled: true, tags: [], enforced: true,
          kind: "dictionary", terms: ["banana"], caseSensitive: false,
        },
      ],
    };
    const judge = new FakeJudge({ verdict: "match", confidence: 0.9 }, true, 0, true);
    const result = await detectPrompt("I like banana bread", policy, "example.com", false, judge);
    // the broken judge_prompt rule produced nothing; the sync dictionary rule still fired
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("dict-1");
  });

  it("fails open silently when classify() exceeds the timeout", async () => {
    const policy = policyWithJudgePrompt("Does this contain a secret?", "block");
    const judge = new FakeJudge({ verdict: "match", confidence: 0.9 }, true, 5000);
    const result = await detectPrompt("this is a secret", policy, "example.com", false, judge);
    expect(result.highestAction).toBe("log");
    expect(result.findings).toHaveLength(0);
  }, 10_000);

  it("omitting judge entirely skips judge_prompt rules with no error", async () => {
    const policy = policyWithJudgePrompt("Does this contain a secret?", "block");
    const result = await detectPrompt("this is a secret", policy, "example.com");
    expect(result.highestAction).toBe("log");
    expect(result.findings).toHaveLength(0);
  });

  it("does not call classify at all when there are no judge_prompt rules", async () => {
    let calls = 0;
    class CountingJudge extends FakeJudge {
      async classify(input: JudgeInput): Promise<JudgeVerdict> {
        calls++;
        return super.classify(input);
      }
    }
    const judge = new CountingJudge({ verdict: "match", confidence: 0.9 });
    await detectPrompt("hello world", DEFAULT_POLICY, "example.com", false, judge);
    expect(calls).toBe(0);
  });

  it("truncates a judge_prompt match's matchedText to 200 chars, same as every other rule kind", async () => {
    const policy = policyWithJudgePrompt("Does this contain a secret?", "block");
    const judge = new FakeJudge({ verdict: "match", confidence: 0.9 });
    const longText = "x".repeat(500);
    const result = await detectPrompt(longText, policy, "example.com", false, judge);
    expect(result.findings[0]!.matchedText).toHaveLength(200);
  });

  it("keeps every matching judge_prompt rule as a separate finding, and highestAction is the strongest action among them", async () => {
    const policy: Policy = {
      ...DEFAULT_POLICY,
      baseline: [],
      custom: [
        {
          id: "jp-warn", name: "Warn rule", description: "", severity: "high",
          action: "warn", enabled: true, tags: [], enforced: true,
          kind: "judge_prompt", prompt: "Does this discuss roadmap items?",
        },
        {
          id: "jp-block", name: "Block rule", description: "", severity: "medium",
          action: "block", enabled: true, tags: [], enforced: true,
          kind: "judge_prompt", prompt: "Does this contain a secret?",
        },
      ],
    };
    const judge = new FakeJudge({ verdict: "match", confidence: 0.9 });
    const result = await detectPrompt("this leaks a secret and the roadmap", policy, "example.com", false, judge);
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.ruleId).sort()).toEqual(["jp-block", "jp-warn"]);
    expect(result.highestAction).toBe("block");
  });

  it("a disabled judge_prompt rule is never evaluated, matching every other rule kind's enabled check", async () => {
    const policy: Policy = {
      ...policyWithJudgePrompt("Does this contain a secret?", "block"),
      custom: [{ ...policyWithJudgePrompt("x", "block").custom[0]!, enabled: false }],
    };
    let calls = 0;
    class CountingJudge extends FakeJudge {
      async classify(input: JudgeInput): Promise<JudgeVerdict> {
        calls++;
        return super.classify(input);
      }
    }
    const judge = new CountingJudge({ verdict: "match", confidence: 0.9 });
    const result = await detectPrompt("this is a secret", policy, "example.com", false, judge);
    expect(calls).toBe(0);
    expect(result.highestAction).toBe("log");
  });
});
