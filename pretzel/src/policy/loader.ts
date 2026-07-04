import { PolicyDocSchema, type Policy, type PolicyDoc } from "@ciyo/detect";
import { bridgePolicy } from "@ciyo/detect";
import { DEFAULT_POLICY } from "@ciyo/detect";
import { STORAGE_SITE_OVERRIDES_KEY } from "@/shared/constants";
import { logger } from "@/shared/logger";

async function getStoredDoc(): Promise<PolicyDoc | null> {
  const result = await chrome.storage.local.get("policyDoc") as Record<string, unknown>;
  const raw = result["policyDoc"];
  if (!raw) return null;
  const parsed = PolicyDocSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn("Stored policyDoc parse failed:", parsed.error);
    return null;
  }
  return parsed.data;
}

async function getDisabledSites(): Promise<string[]> {
  const result = await chrome.storage.local.get(STORAGE_SITE_OVERRIDES_KEY) as Record<string, unknown>;
  const raw = result[STORAGE_SITE_OVERRIDES_KEY];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

async function getStoredFailMode(): Promise<"open" | "closed"> {
  const result = await chrome.storage.local.get("failMode") as Record<string, unknown>;
  return result["failMode"] === "closed" ? "closed" : "open";
}

/** A policy that blocks all prompts — used when failMode is "closed" and no cached policy exists. */
const CLOSED_POLICY: Policy = {
  ...DEFAULT_POLICY,
  baseline: [
    {
      kind: "pattern",
      id: "ciyo-failmode-closed",
      name: "Policy unavailable (fail-closed)",
      description: "No policy available and organisation requires fail-closed enforcement.",
      severity: "critical",
      action: "block",
      enabled: true,
      tags: ["system"],
      pattern: "[\\s\\S]+",
      flags: "s",
      validator: "none",
      scope: "all",
    },
  ],
  failMode: "closed",
};

export async function loadPolicy(): Promise<Policy> {
  try {
    const [doc, disabledSites] = await Promise.all([getStoredDoc(), getDisabledSites()]);
    if (!doc) {
      const failMode = await getStoredFailMode();
      return failMode === "closed" ? CLOSED_POLICY : DEFAULT_POLICY;
    }
    // Persist failMode so it's available even when the doc is absent (e.g. cache wiped).
    await chrome.storage.local.set({ failMode: doc.failMode });
    return bridgePolicy(doc, disabledSites);
  } catch (err) {
    logger.error("Failed to load policy:", err);
    return DEFAULT_POLICY;
  }
}

export async function getSiteConfigs(): Promise<PolicyDoc["siteConfigs"]> {
  try {
    const doc = await getStoredDoc();
    return doc?.siteConfigs ?? {};
  } catch {
    return {};
  }
}
