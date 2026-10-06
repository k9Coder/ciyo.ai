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
  // isAvailable() must be synchronous (the LocalJudge contract), but the
  // engine only ever calls classify() once isAvailable() has already
  // returned true — a flag that only flips inside classify() can never
  // flip at all. Mirrors ThemisLocalJudge's own pattern: isAvailable()
  // kicks off an async readiness check without blocking, and returns the
  // last known state.
  private ready = false;
  private checkingReady = false;

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
    })().catch((err: unknown) => {
      // Never cache a failed attempt — a transient createDocument failure
      // (quota, a concurrent doc elsewhere) must not permanently disable
      // judging for this service-worker generation.
      this.offscreenReady = null;
      throw err;
    });

    return this.offscreenReady;
  }

  isAvailable(): boolean {
    if (!this.checkingReady) {
      this.checkingReady = true;
      void this.checkReady().finally(() => { this.checkingReady = false; });
    }
    return this.ready;
  }

  private async checkReady(): Promise<void> {
    try {
      await this.ensureOffscreenDocument();
      const result = (await chrome.runtime.sendMessage({ type: "LOCAL_JUDGE_PING" })) as { available: boolean };
      this.ready = !!result?.available;
    } catch {
      this.ready = false;
    }
  }

  async classify(input: JudgeInput): Promise<JudgeVerdict> {
    await this.ensureOffscreenDocument();
    return (await chrome.runtime.sendMessage({
      type: "LOCAL_JUDGE_CLASSIFY",
      payload: { prompt: input.prompt, text: input.text },
    })) as JudgeVerdict;
  }
}
