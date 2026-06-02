import type { PatternRule } from "@/policy/schema";

export const CREDENTIAL_RULE_IDS = new Set([
  "pem-private-key",
  "ssh-private-key",
  "jwt-token",
  "dotenv-line",
]);

export function isCredentialRule(rule: PatternRule): boolean {
  return rule.tags.includes("credentials");
}
