import { API_BASE } from "@/shared/constants";
import { PolicyDocSchema } from "@mykka/detect";
import type { DetectionResult } from "@mykka/detect";
import { getAuthToken } from "@/policy/auth";
import { buildAuthHeaders } from "@/auth/headers";

function getRuleReportLevel(ruleId: string, policyDoc: unknown): "none" | "minimal" | "medium" | "rich" {
  const parsed = PolicyDocSchema.safeParse(policyDoc);
  if (!parsed.success) return "none";
  for (const subject of parsed.data.subjects) {
    const rule = subject.rules.find(r => r.id === ruleId);
    if (rule) return rule.reportLevel;
  }
  return "none";
}

export async function dispatchEvents(
  result: DetectionResult,
  hostname: string
): Promise<void> {
  const reportable = result.findings.filter(
    f => f.action === "warn" || f.action === "block"
  );
  if (reportable.length === 0) return;

  const [token, stored] = await Promise.all([
    getAuthToken(),
    chrome.storage.local.get("policyDoc") as Promise<Record<string, unknown>>,
  ]);
  if (!token) return;

  const policyDoc = stored["policyDoc"];
  const authHeaders = await buildAuthHeaders(token);

  for (const finding of reportable) {
    const reportLevel = getRuleReportLevel(finding.ruleId, policyDoc);
    if (reportLevel === "none") continue;

    const body: Record<string, unknown> = {
      ruleId:  finding.ruleId,
      action:  finding.action,
      siteUrl: hostname,
    };
    if (reportLevel === "rich") {
      body["matchedTerm"] = finding.matchedText;
    }

    fetch(`${API_BASE}/v1/events`, {
      method:  "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    }).catch(() => {}); // fire-and-forget
  }
}
