import type { PatternRule } from "@/policy/schema";

export const NETWORK_RULE_IDS = new Set(["rfc1918-ip"]);

export function isNetworkRule(rule: PatternRule): boolean {
  return rule.tags.includes("network");
}
