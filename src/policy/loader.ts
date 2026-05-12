import { PolicySchema, type Policy } from "./schema";
import { DEFAULT_POLICY } from "./defaults";
import { STORAGE_POLICY_KEY } from "@/shared/constants";
import { logger } from "@/shared/logger";

/**
 * Load the active policy from chrome.storage.
 * Merges: managed (enterprise, read-only) > sync (user-level) > local (device).
 * Falls back to the built-in DEFAULT_POLICY on any parse error.
 */
export async function loadPolicy(): Promise<Policy> {
  try {
    // chrome.storage.managed may not be available without enterprise deployment.
    const [localData, syncData] = await Promise.all([
      chrome.storage.local.get(STORAGE_POLICY_KEY),
      chrome.storage.sync.get(STORAGE_POLICY_KEY).catch(() => ({})),
    ]);

    const raw = syncData[STORAGE_POLICY_KEY] ?? localData[STORAGE_POLICY_KEY];
    if (!raw) return DEFAULT_POLICY;

    const result = PolicySchema.safeParse(raw);
    if (!result.success) {
      logger.warn("Policy parse failed, falling back to defaults:", result.error);
      return DEFAULT_POLICY;
    }
    return result.data;
  } catch (err) {
    logger.error("Failed to load policy:", err);
    return DEFAULT_POLICY;
  }
}

/** Persist a policy to chrome.storage.local. */
export async function savePolicy(policy: Policy): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_POLICY_KEY]: policy });
}

/** Reset to the built-in defaults. */
export async function resetPolicy(): Promise<void> {
  await savePolicy(DEFAULT_POLICY);
}
