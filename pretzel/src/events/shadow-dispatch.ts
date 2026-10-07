import { API_BASE } from "@/shared/constants";
import { toShadowVerdictPayload } from "@mykka/detect";
import type { ShadowFinding } from "@mykka/detect";
import { getAuthToken } from "@/policy/auth";
import { buildAuthHeaders } from "@/auth/headers";

export async function dispatchShadowTelemetry(shadowFindings: ShadowFinding[]): Promise<void> {
  if (shadowFindings.length === 0) return;
  const token = await getAuthToken();
  if (!token) return;

  const authHeaders = await buildAuthHeaders(token);
  fetch(`${API_BASE}/v1/telemetry/shadow-verdict`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(shadowFindings.map(toShadowVerdictPayload)),
  }).catch(() => {}); // fire-and-forget, same as dispatchEvents
}
