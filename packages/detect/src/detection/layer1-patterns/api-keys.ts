import type { PatternRule } from "../../policy/schema";

export const API_KEY_RULE_IDS = new Set([
  "openai-api-key",
  "openai-project-key",
  "anthropic-api-key",
  "aws-access-key",
  "github-token",
  "slack-token",
  "google-api-key",
  "stripe-live-secret-key",
  "huggingface-token",
  "npm-token",
  "azure-connection-string",
]);

export function isApiKeyRule(rule: PatternRule): boolean {
  return rule.tags.includes("api-key");
}
