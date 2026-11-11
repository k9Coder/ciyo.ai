/**
 * Offscreen-document side of judge v2 shadow mode: downloads the models into
 * the Cache API on first need, runs the cascade on onnxruntime-web (WASM, CPU),
 * and sends the content-free rows back to the service worker for reporting.
 */
import * as ort from "onnxruntime-web/wasm";
import {
  createCascade, createOnnxScorer, createShadowRunner, ensureModels, loadModelFiles, manifestFor, MANIFEST, LOCKED_POLICY,
  type Cascade, type JudgeShadowRow, type PrimarySummary, type ShadowRule, type ShadowRunner,
} from "@mykka/judge-v2";
import { createCacheStore } from "@mykka/judge-v2/store-cache";

export interface ShadowSubmitPayload { text: string; rules: ShadowRule[]; primary: PrimarySummary }

export function isLowMemory(nav: { deviceMemory?: number }): boolean {
  return typeof nav.deviceMemory === "number" && nav.deviceMemory < 4;
}

export function handleShadowSubmit(runner: Pick<ShadowRunner, "submit">, payload: ShadowSubmitPayload | null | undefined): void {
  try {
    if (!payload || typeof payload.text !== "string" || !Array.isArray(payload.rules)) return;
    runner.submit(payload.text, payload.rules, payload.primary ?? { actionByRuleId: {} });
  } catch {
    // Never let shadow mode break the offscreen document.
  }
}

export function createExtensionShadow(report: (rows: JudgeShadowRow[]) => void, modelBase?: string): ShadowRunner {
  ort.env.wasm.wasmPaths = chrome.runtime.getURL("ort/");
  // Offscreen documents are not cross-origin isolated, so ORT runs single-threaded; keep it explicit.
  ort.env.wasm.numThreads = 1;
  const manifest = modelBase ? manifestFor(modelBase) : MANIFEST;
  const store = createCacheStore();
  let cascade: Promise<Cascade> | null = null;
  let version: string | null = null;

  async function loadCascade(): Promise<Cascade> {
    const fastFiles = await loadModelFiles(manifest, store, "fast");
    const fast = await createOnnxScorer(ort, fastFiles);
    version = `${fastFiles.config.model_version}+so_${manifest.version}`;
    const second = async () => createOnnxScorer(ort, await loadModelFiles(manifest, store, "second"));
    return createCascade({ fast, second, ...LOCKED_POLICY, secondTimeoutMs: 10_000, idleUnloadMs: 300_000 });
  }

  return createShadowRunner({
    surface: "extension",
    async getCascade() {
      if (!(await store.isReady(manifest.version))) {
        void ensureModels(manifest, store, fetch);
        return null;
      }
      cascade ??= loadCascade().catch((err) => { cascade = null; throw err; });
      return cascade;
    },
    modelVersion: () => version,
    report,
    lowMemory: () => isLowMemory(navigator as { deviceMemory?: number }),
  });
}
