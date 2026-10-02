/**
 * Offscreen document for the local-judge wiring spike (spike/local-judge-poc).
 *
 * Hosts the LocalJudge so it survives outside the service worker's ~30s
 * idle-kill lifecycle (service-worker.ts can't hold a loaded model in memory
 * between calls; this document only closes when explicitly told to).
 *
 * Hosts TransformersLocalJudge (onnx-community/Qwen2.5-0.5B-Instruct via WASM)
 * — see transformers-judge.ts for why this model was picked over the
 * StubLocalJudge placeholder that originally proved this wiring, and over a
 * generic zero-shot NLI classifier that was tried and rejected first.
 */
import type { LocalJudge, JudgeInput } from "@mykka/detect";
import { TransformersLocalJudge } from "./transformers-judge";

const judge: LocalJudge = new TransformersLocalJudge();

type ClassifyMessage = {
  type: "LOCAL_JUDGE_CLASSIFY";
  payload: JudgeInput;
};

function isClassifyMessage(message: unknown): message is ClassifyMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "LOCAL_JUDGE_CLASSIFY"
  );
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isClassifyMessage(message)) return undefined;

  judge
    .classify(message.payload)
    .then(sendResponse)
    .catch((err: unknown) => {
      console.error("[local-judge-poc:offscreen] classify failed", err);
      sendResponse({ verdict: "no_match", confidence: 0 });
    });

  return true; // keep the message channel open for the async response
});
