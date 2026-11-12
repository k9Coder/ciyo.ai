// Maps @mykka/detect's policy and detection result onto shadow-runner inputs. Structural types only, so this
// package does not depend on @mykka/detect. Shared by the desktop app and the extension.
import type { PrimarySummary, ShadowRule } from "./shadow";

interface PolicyLike { baseline: RuleLike[]; custom: RuleLike[] }
interface RuleLike { id: string; kind: string; enabled: boolean; prompt?: string }
interface ResultLike { findings: { ruleId: string; action: string }[] }

export function shadowRulesFrom(policy: PolicyLike): ShadowRule[] {
  const out: ShadowRule[] = [];
  for (const r of [...policy.baseline, ...policy.custom]) {
    if (!r.enabled) continue;
    if (r.kind === "judge_prompt") out.push({ id: r.id, kind: "judge_prompt", prompt: r.prompt ?? "" });
    else if (r.kind === "dictionary") out.push({ id: r.id, kind: "keyword" });
    else if (r.kind === "pattern") out.push({ id: r.id, kind: "pattern" });
  }
  return out;
}

export function primarySummaryFrom(result: ResultLike): PrimarySummary {
  const actionByRuleId: PrimarySummary["actionByRuleId"] = {};
  for (const f of result.findings) actionByRuleId[f.ruleId] = f.action === "block" ? "block" : f.action === "log" ? "log" : "warn";
  return { actionByRuleId };
}

/** True when the policy has at least one enabled judge_prompt rule with text — the only case the shadow runs. */
export function needsJudgeShadow(policy: PolicyLike | null | undefined): boolean {
  return !!policy && [...policy.baseline, ...policy.custom].some((r) => r.enabled && r.kind === "judge_prompt" && (r.prompt ?? "").trim().length > 0);
}
