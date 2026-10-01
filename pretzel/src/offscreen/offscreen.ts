/**
 * Offscreen document for the local-judge wiring spike (spike/local-judge-poc).
 *
 * Hosts the LocalJudge so it survives outside the service worker's ~30s
 * idle-kill lifecycle (service-worker.ts can't hold a loaded model in memory
 * between calls; this document only closes when explicitly told to). Right
 * now it hosts StubLocalJudge — a deterministic placeholder — proving the
 * message-passing/lifecycle wiring works. Swapping in a real WASM runtime
 * (e.g. ONNX Runtime Web) happens here, behind the same LocalJudge contract,
 * once the wiring itself is proven.
 */
import { StubLocalJudge, type LocalJudge, type JudgeInput } from "@mykka/detect";

const judge: LocalJudge = new StubLocalJudge();

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
