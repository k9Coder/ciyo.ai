import { API_BASE } from "@/shared/constants";

async function getAuthToken(): Promise<string | null> {
  const clerkResult = await chrome.storage.local.get("clerkSessionToken") as Record<string, unknown>;
  if (typeof clerkResult["clerkSessionToken"] === "string") return clerkResult["clerkSessionToken"];
  const managed = await chrome.storage.managed.get("orgToken").catch(() => ({})) as Record<string, unknown>;
  if (typeof managed["orgToken"] === "string") return managed["orgToken"];
  const local = await chrome.storage.local.get("orgToken") as Record<string, unknown>;
  return typeof local["orgToken"] === "string" ? local["orgToken"] : null;
}

export async function isScanLimitReached(): Promise<boolean> {
  const stored = await chrome.storage.local.get("scanLimitReached") as Record<string, unknown>;
  return stored["scanLimitReached"] === true;
}

export async function dispatchScan(): Promise<void> {
  const token = await getAuthToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/v1/scans`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 402) {
      await chrome.storage.local.set({ scanLimitReached: true });
    } else if (res.ok) {
      // Clear the flag if a scan succeeds (limit may have reset)
      await chrome.storage.local.remove("scanLimitReached");
    }
  } catch {
    // Network error — don't clear the flag
  }
}
