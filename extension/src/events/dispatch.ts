import { API_BASE } from "@/shared/constants";
import { PolicyDocSchema } from "@/policy/schema";
import type { DetectionResult } from "@/detection/types";

async function getAuthToken(): Promise<string | null> {
  const clerkResult = await chrome.storage.local.get("clerkSessionToken") as Record<string, unknown>;
  if (typeof clerkResult["clerkSessionToken"] === "string") return clerkResult["clerkSessionToken"];

  const managed = await chrome.storage.managed.get("orgToken").catch(() => ({})) as Record<string, unknown>;
  if (typeof managed["orgToken"] === "string") return managed["orgToken"];

  const local = await chrome.storage.local.get("orgToken") as Record<string, unknown>;
  return typeof local["orgToken"] === "string" ? local["orgToken"] : null;
}

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
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    }).catch(() => {}); // fire-and-forget
  }
}
