const API_BASE = "https://api.promptshield.dev";

async function getOrgToken(): Promise<string | null> {
  const managed = await chrome.storage.managed.get("orgToken").catch(() => ({})) as Record<string, unknown>;
  if (typeof managed["orgToken"] === "string") return managed["orgToken"];
  const local = await chrome.storage.local.get("orgToken") as Record<string, unknown>;
  return typeof local["orgToken"] === "string" ? local["orgToken"] : null;
}

async function getCachedVersion(): Promise<number | null> {
  const result = await chrome.storage.local.get("cachedPolicyVersion") as Record<string, unknown>;
  const v = result["cachedPolicyVersion"];
  return typeof v === "number" ? v : null;
}

export async function syncPolicy(): Promise<void> {
  const token = await getOrgToken();
  if (!token) return;

  try {
    const versionRes = await fetch(`${API_BASE}/v1/policy/version`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!versionRes.ok) {
      if (versionRes.status === 402) await chrome.storage.local.set({ subscriptionExpired: true });
      return;
    }
    const { version } = await versionRes.json() as { version: number };
    const cached = await getCachedVersion();
    if (cached === version) return;

    const policyRes = await fetch(`${API_BASE}/v1/policy`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!policyRes.ok) {
      if (policyRes.status === 402) await chrome.storage.local.set({ subscriptionExpired: true });
      return;
    }
    const body = await policyRes.json() as {
      version: number; policy: unknown; warning?: string; tenantName: string;
    };
    await chrome.storage.local.set({
      policy: body.policy,
      cachedPolicyVersion: body.version,
      tenantName: body.tenantName,
      subscriptionExpired: false,
      subscriptionWarning: body.warning === "subscription_expiring",
    });
  } catch {
    // Network error — leave cached policy in place, do not surface to user
  }
}
