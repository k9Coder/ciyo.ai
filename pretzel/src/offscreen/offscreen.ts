/**
 * Offscreen document. Holds open a chrome.runtime.connect() port back to the
 * service worker — one of Chrome's documented signals that keeps the MV3
 * service worker from being torn down while this document exists — and hosts
 * the judge v2 shadow runner (docs/superpowers/specs/2026-11-11-judge-v2-
 * shadow-mode-design.md). The runner module (onnxruntime-web + models) is
 * loaded on the first shadow submit, not at document load.
 */
import type { ShadowRunner } from "@mykka/judge-v2";
import type { ShadowSubmitPayload } from "./judge-shadow-host";

const JUDGE_SHADOW_SUBMIT = "JUDGE_SHADOW_SUBMIT";
const JUDGE_SHADOW_ROWS = "JUDGE_SHADOW_ROWS";

chrome.runtime.connect({ name: "local-judge-keepalive" });

let runner: Promise<{ runner: ShadowRunner; handle: (r: ShadowRunner, p: ShadowSubmitPayload) => void }> | null = null;

function getRunner() {
  runner ??= import("./judge-shadow-host").then((m) => ({
    runner: m.createExtensionShadow(
      (rows) => { void chrome.runtime.sendMessage({ type: JUDGE_SHADOW_ROWS, rows }).catch(() => {}); },
      import.meta.env.VITE_JUDGE_V2_MODEL_BASE || undefined,
    ),
    handle: m.handleShadowSubmit,
  }));
  return runner;
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  const m = message as { type?: string; payload?: ShadowSubmitPayload };
  if (m?.type !== JUDGE_SHADOW_SUBMIT) return undefined;
  getRunner().then(({ runner: r, handle }) => handle(r, m.payload!)).catch(() => { runner = null; });
  return undefined;
});
