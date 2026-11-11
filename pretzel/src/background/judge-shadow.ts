/**
 * Service-worker side of judge v2 shadow mode (docs/superpowers/specs/
 * 2026-11-11-judge-v2-shadow-mode-design.md). After the primary decision has
 * been made, the prompt is handed to the offscreen document, which runs the
 * models; this never waits for it. The prompt only travels between the
 * extension's own contexts — never off the device.
 */
import type { Policy, DetectionResult } from "@mykka/detect";
import { needsJudgeShadow, primarySummaryFrom, shadowRulesFrom } from "@mykka/judge-v2";

export const JUDGE_SHADOW_SUBMIT = "JUDGE_SHADOW_SUBMIT";
export const JUDGE_SHADOW_ROWS = "JUDGE_SHADOW_ROWS";

const OFFSCREEN_URL = "src/offscreen/index.html";
let creating: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  creating ??= (async () => {
    const existing = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
    if (existing.length > 0) return;
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "Runs the on-device judge v2 model in shadow mode outside the service worker's idle-kill lifecycle.",
    });
  })().finally(() => { creating = null; });
  return creating;
}

/** Resolves once the job is handed off (or skipped); never waits for the model and never throws. */
export async function submitJudgeShadow(text: string, policy: Policy, result: DetectionResult): Promise<void> {
  try {
    if (!needsJudgeShadow(policy)) return;
    await ensureOffscreenDocument();
    const payload = { text, rules: shadowRulesFrom(policy), primary: primarySummaryFrom(result) };
    void chrome.runtime.sendMessage({ type: JUDGE_SHADOW_SUBMIT, payload }).catch(() => {});
  } catch {
    // Shadow mode must never affect the extension.
  }
}
