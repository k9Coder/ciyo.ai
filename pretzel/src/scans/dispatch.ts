import { API_BASE } from "@/shared/constants";
import { getAuthToken } from "@/policy/auth";
import { buildAuthHeaders } from "@/auth/headers";

export async function isScanLimitReached(): Promise<boolean> {
  const stored = await chrome.storage.local.get("scanLimitReached") as Record<string, unknown>;
  return stored["scanLimitReached"] === true;
}

export async function dispatchScan(): Promise<void> {
  const token = await getAuthToken();
  if (!token) return;
  try {
    const headers = await buildAuthHeaders(token);
    const res = await fetch(`${API_BASE}/v1/scans`, {
      method:  "POST",
      headers,
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
