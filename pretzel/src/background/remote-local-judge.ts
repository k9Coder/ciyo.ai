/**
 * LocalJudge implementation for the extension: the real ThemisLocalJudge
 * only runs inside the offscreen document (offscreen/offscreen.ts) — MV3
 * service workers are killed after ~30s idle and can't hold a loaded model
 * in memory. This class lazily ensures that document exists and proxies
 * classify() calls to it over chrome.runtime messaging — the same
 * lazy-create + message-passing logic local-judge-poc.ts already proved
 * works, now wrapped behind the LocalJudge interface instead of bespoke
 * PoC-only code.
 */
import type { JudgeInput, JudgeVerdict, LocalJudge } from "@mykka/detect";

const OFFSCREEN_URL = "src/offscreen/index.html";

export class RemoteLocalJudge implements LocalJudge {
  private offscreenReady: Promise<void> | null = null;
  private hasClassifiedSuccessfully = false;

  private async ensureOffscreenDocument(): Promise<void> {
    if (this.offscreenReady) return this.offscreenReady;

    this.offscreenReady = (async () => {
      const existing = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      });
      if (existing.length > 0) return;

      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: "Hosts the local-judge model outside the service worker's idle-kill lifecycle.",
      });
    })();

    return this.offscreenReady;
  }

  isAvailable(): boolean {
    return this.hasClassifiedSuccessfully;
  }

  async classify(input: JudgeInput): Promise<JudgeVerdict> {
    await this.ensureOffscreenDocument();
    const result = (await chrome.runtime.sendMessage({
      type: "LOCAL_JUDGE_CLASSIFY",
      payload: { prompt: input.prompt, text: input.text },
    })) as JudgeVerdict;
    this.hasClassifiedSuccessfully = true;
    return result;
  }
}
