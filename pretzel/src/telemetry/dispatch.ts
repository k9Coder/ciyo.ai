import { API_BASE, EXTENSION_VERSION } from "@/shared/constants";
import { getAuthToken } from "@/policy/auth";
import type { EnforcementReason } from "@/shared/messages";

/**
 * Degraded-enforcement telemetry — the "detection broke" signal.
 *
 * Fire-and-forget POST to /v1/telemetry/enforcement. Carries only host + reason
 * (never prompt content). Debounced per host+reason so a broken site cannot spam
 * the backend.
 */

const DEBOUNCE_MS = 60_000;
const lastSent = new Map<string, number>();

export async function reportDegraded(hostname: string, reason: EnforcementReason): Promise<void> {
  const key = `${reason}:${hostname}`;
  const now = Date.now();
  const prev = lastSent.get(key) ?? 0;
  if (now - prev < DEBOUNCE_MS) return;
  lastSent.set(key, now);

  const token = await getAuthToken();
  if (!token) return; // unauthenticated — nothing to attribute the signal to

  fetch(`${API_BASE}/v1/telemetry/enforcement`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ hostname, reason, extVersion: EXTENSION_VERSION }),
  }).catch(() => {}); // fire-and-forget
}
