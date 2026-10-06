/**
 * Shadow-mode wiring for the local-judge PoC (branch: spike/local-judge-poc).
 *
 * Runs judge-prompt test rules against the same text the DETECT handler
 * already inspects, and only LOGS verdicts — never affects the returned
 * DetectionResult, never blocks/warns. Gated on IS_DEV so it's a no-op in any
 * real build; this is a wiring spike, not a shipped feature.
 *
 * The actual judge model runs in an offscreen document (offscreen/offscreen.ts),
 * not here — MV3 service workers are killed after ~30s idle and can't hold a
 * loaded model in memory between calls. This module only orchestrates:
 * lazily creates the offscreen document, sends classify requests, logs
 * results. See offscreen/offscreen.ts for why that document is needed at all.
 */
import { POC_JUDGE_RULES, type JudgeVerdict } from "@mykka/detect";
import { IS_DEV } from "@/env";
import { logger } from "@/shared/logger";

const OFFSCREEN_URL = "src/offscreen/index.html";
let offscreenReady: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  if (offscreenReady) return offscreenReady;

  offscreenReady = (async () => {
    const existing = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });
    if (existing.length > 0) return;

    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "Hosts the local-judge model outside the service worker's idle-kill lifecycle (spike/local-judge-poc).",
    });
  })();

  return offscreenReady;
}

function classifyViaOffscreen(prompt: string, text: string): Promise<JudgeVerdict> {
  return chrome.runtime.sendMessage({
    type: "LOCAL_JUDGE_CLASSIFY",
    payload: { prompt, text },
  }) as Promise<JudgeVerdict>;
}

/** Fire-and-forget — callers must not await this on the DETECT response path. */
export async function runLocalJudgePoc(hostname: string, text: string): Promise<void> {
  if (!IS_DEV) return;

  try {
    await ensureOffscreenDocument();
  } catch (err) {
    logger.error("[local-judge-poc] failed to create offscreen document", err);
    return;
  }

  for (const rule of POC_JUDGE_RULES) {
    try {
      const start = Date.now();
      const result = await classifyViaOffscreen(rule.prompt, text);
      const ms = Date.now() - start;
      logger.info(
        `[local-judge-poc] host=${hostname} rule=${rule.id} verdict=${result.verdict} confidence=${result.confidence.toFixed(2)} ms=${ms}`,
      );
    } catch (err) {
      logger.error(`[local-judge-poc] rule=${rule.id} failed`, err);
    }
  }
}
