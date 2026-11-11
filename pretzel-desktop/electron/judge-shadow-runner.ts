/**
 * The judge v2 shadow runner for the desktop app. Runs inside a worker thread
 * (judge-shadow-worker.ts) so tokenizing and scoring never block the proxy's
 * event loop. Models are downloaded on first need into
 * <userData>/models/judge-v2/<version>/ and loaded lazily; the second-opinion
 * model unloads after 5 idle minutes (cascade idleUnloadMs).
 */
import os from 'os'
import path from 'path'
import {
  createCascade, createOnnxScorer, createShadowRunner, ensureModels, loadModelFiles, manifestFor, MANIFEST, LOCKED_POLICY,
  type Cascade, type JudgeShadowRow, type ModelManifest, type PrimarySummary, type ShadowRule,
} from '@mykka/judge-v2'
import { createFsStore } from '@mykka/judge-v2/store-fs'

/** Device class, like the extension's navigator.deviceMemory < 4 (free memory is misleading on macOS). */
export function isLowMemoryDesktop(totalBytes: number): boolean {
  return totalBytes < 4 * 2 ** 30
}

export interface DesktopRunner {
  submit(text: string, rules: ShadowRule[], primary: PrimarySummary): void
  /** Start the background model download. */
  prepare(): void
}

export function createDesktopRunner(deps: {
  userDataDir: string
  report: (rows: JudgeShadowRow[]) => void
  fetchFn?: typeof fetch
  modelBase?: string
}): DesktopRunner {
  const manifest: ModelManifest = deps.modelBase ? manifestFor(deps.modelBase) : MANIFEST
  const root = path.join(deps.userDataDir, 'models', 'judge-v2')
  const store = createFsStore(root)
  const fetchFn = deps.fetchFn ?? fetch
  let cascade: Promise<Cascade> | null = null
  const version = `fast_${manifest.version}+so_${manifest.version}`

  async function loadCascade(): Promise<Cascade> {
    const ort = await import('onnxruntime-node')
    const onnxPath = (name: string) => path.join(root, manifest.version, name)
    // Both models load on demand and unload after 5 idle minutes; ONNX Runtime reads the model file itself.
    const load = (which: 'fast' | 'second') => async () =>
      createOnnxScorer(ort, await loadModelFiles(manifest, store, which, { onnxPath }))
    return createCascade({ fast: load('fast'), second: load('second'), ...LOCKED_POLICY, secondTimeoutMs: 10_000, idleUnloadMs: 300_000 })
  }

  const runner = createShadowRunner({
    surface: 'desktop',
    async getCascade() {
      if (!(await store.isReady(manifest.version))) {
        void ensureModels(manifest, store, fetchFn)
        return null
      }
      cascade ??= loadCascade().catch((err) => { cascade = null; throw err })
      return cascade
    },
    modelVersion: () => version,
    report: deps.report,
    lowMemory: () => isLowMemoryDesktop(os.totalmem()),
    // Desktop judges whole request bodies (often the full chat JSON on every turn): judge only the last
    // 12 000 chars (~one fast-model window), where the newest message usually is, to bound CPU per send.
    maxChars: 12_000,
    clip: 'tail',
  })

  return {
    submit: (text, rules, primary) => runner.submit(text, rules, primary),
    prepare: () => { void ensureModels(manifest, store, fetchFn) },
  }
}
