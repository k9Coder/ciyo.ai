/**
 * Offscreen document for the local-judge wiring spike (spike/local-judge-poc).
 *
 * Hosts the LocalJudge so it survives outside the service worker's ~30s
 * idle-kill lifecycle (service-worker.ts can't hold a loaded model in memory
 * between calls; this document only closes when explicitly told to).
 *
 * Hosts ThemisLocalJudge (DeBERTa-v3-small, fine-tuned + vocabulary-pruned,
 * bundled as an extension asset) — see themis-judge.ts for why this replaced
 * the earlier TransformersLocalJudge (Qwen2.5-0.5B-Instruct) spike: same
 * accuracy class, 3.5x smaller, ~100x faster per call.
 */
import type { LocalJudge, JudgeInput } from "@mykka/detect";
import { ThemisLocalJudge } from "./themis-judge";

const judge: LocalJudge = new ThemisLocalJudge();

// Opening a port is one of Chrome's documented signals that keeps the
// *service worker* on the other end from being torn down — the piece that
// was missing: the service worker's own fire-and-forget readiness check
// (remote-local-judge.ts) was racing its own teardown and never completing.
// This document doesn't need to send anything over it; holding it open is
// the entire point. Never disconnected — it lives as long as this document.
chrome.runtime.connect({ name: "local-judge-keepalive" });

type ClassifyMessage = {
  type: "LOCAL_JUDGE_CLASSIFY";
  payload: JudgeInput;
};

type PingMessage = {
  type: "LOCAL_JUDGE_PING";
};

function isClassifyMessage(message: unknown): message is ClassifyMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "LOCAL_JUDGE_CLASSIFY"
  );
}

function isPingMessage(message: unknown): message is PingMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "LOCAL_JUDGE_PING"
  );
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isPingMessage(message)) {
    sendResponse({ available: judge.isAvailable() });
    return undefined;
  }

  if (!isClassifyMessage(message)) return undefined;

  judge
    .classify(message.payload)
    .then(sendResponse)
    .catch((err: unknown) => {
      console.error("[local-judge:offscreen] classify failed", err);
      sendResponse({ verdict: "no_match", confidence: 0 });
    });

  return true; // keep the message channel open for the async response
});
