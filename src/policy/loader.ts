import { PolicyDocSchema, type Policy, type PolicyDoc } from "./schema";
import { bridgePolicy } from "./bridge";
import { DEFAULT_POLICY } from "./defaults";
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

export async function loadPolicy(): Promise<Policy> {
  try {
    const [doc, disabledSites] = await Promise.all([getStoredDoc(), getDisabledSites()]);
    if (!doc) return DEFAULT_POLICY;
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
