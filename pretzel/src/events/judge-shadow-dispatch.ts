import { API_BASE } from "@/shared/constants";
import type { JudgeShadowRow } from "@mykka/judge-v2";
import { getAuthToken } from "@/policy/auth";
import { buildAuthHeaders } from "@/auth/headers";

const BATCH = 100;

/** Posts content-free judge v2 shadow rows; best-effort like dispatchShadowTelemetry. */
export async function dispatchJudgeShadow(rows: JudgeShadowRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const token = await getAuthToken();
    if (!token) return;
    const headers = { ...(await buildAuthHeaders(token)), "Content-Type": "application/json" };
    for (let i = 0; i < rows.length; i += BATCH) {
      await fetch(`${API_BASE}/v1/telemetry/judge-shadow`, {
        method: "POST",
        headers,
        body: JSON.stringify(rows.slice(i, i + BATCH)),
      }).catch(() => {});
    }
  } catch {
    // Best-effort.
  }
}
