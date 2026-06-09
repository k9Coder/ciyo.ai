import type { PatternRule } from "@/policy/schema";

/**
 * Built-in pattern rules for common API key formats.
 * These are referenced by id in defaults.ts — the actual regex matching
 * is performed by the engine using the PatternRule definition.
 */

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

/**
 * Returns true when a rule id belongs to the API-key category.
 * Used for tagging / reporting purposes.
 */
export function isApiKeyRule(rule: PatternRule): boolean {
  return rule.tags.includes("api-key");
}
