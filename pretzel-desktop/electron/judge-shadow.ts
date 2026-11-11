/**
 * Judge v2 in shadow mode on the desktop app (docs/superpowers/specs/
 * 2026-11-11-judge-v2-shadow-mode-design.md). The proxy hands every inspected
 * request here after the primary (regex/keyword) decision; the cascade runs
 * later, in this process, and only content-free rows leave the machine.
 *
 * Models are downloaded on first need (a policy with an enabled judge_prompt
 * rule) into <userData>/models/judge-v2/<version>/ and loaded lazily; the
 * second-opinion model unloads after 5 idle minutes (cascade idleUnloadMs).
 *
 * The text judged is the same request body the primary rules see (raw JSON
 * from the AI site), so both sides are compared on identical input.
 */
import os from 'os'
import path from 'path'
import type { Policy, DetectionResult } from '@mykka/detect'
import {
  createCascade, createOnnxScorer, createShadowRunner, ensureModels, loadModelFiles, manifestFor, MANIFEST, LOCKED_POLICY,
  shadowRulesFrom, primarySummaryFrom, needsJudgeShadow,
  type Cascade, type JudgeShadowRow, type ModelManifest,
} from '@mykka/judge-v2'
import { createFsStore } from '@mykka/judge-v2/store-fs'

const LOW_MEMORY_BYTES = 2 ** 30

export { shadowRulesFrom, primarySummaryFrom }

export interface DesktopShadow {
  submit(body: string, policy: Policy, result: DetectionResult): void
  /** Start the background model download when the policy needs it. */
  prepare(policy: Policy | null): void
}

export function createDesktopShadow(deps: {
  userDataDir: string
  report: (rows: JudgeShadowRow[]) => void
  fetchFn?: typeof fetch
  modelBase?: string
}): DesktopShadow {
  const manifest: ModelManifest = deps.modelBase ? manifestFor(deps.modelBase) : MANIFEST
  const root = path.join(deps.userDataDir, 'models', 'judge-v2')
  const store = createFsStore(root)
  const fetchFn = deps.fetchFn ?? fetch
  let cascade: Promise<Cascade> | null = null
  let version: string | null = null

  async function loadCascade(): Promise<Cascade> {
    const ort = await import('onnxruntime-node')
    const fastFiles = await loadModelFiles(manifest, store, 'fast')
    const onnxPath = (list: ModelManifest['fast']) => path.join(root, manifest.version, list.find((f) => f.name.endsWith('-judge.onnx'))!.name)
    const fast = await createOnnxScorer(ort, { ...fastFiles, onnx: onnxPath(manifest.fast) })
    version = `${fastFiles.config.model_version}+so_${manifest.version}`
    const second = async () => {
      const files = await loadModelFiles(manifest, store, 'second')
      return createOnnxScorer(ort, { ...files, onnx: onnxPath(manifest.second) })
    }
    return createCascade({ fast, second, ...LOCKED_POLICY, secondTimeoutMs: 10_000, idleUnloadMs: 300_000 })
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
    lowMemory: () => os.freemem() < LOW_MEMORY_BYTES,
  })

  return {
    submit(body, policy, result) {
      runner.submit(body, shadowRulesFrom(policy), primarySummaryFrom(result))
    },
    prepare(policy) {
      if (needsJudgeShadow(policy)) void ensureModels(manifest, store, fetchFn)
    },
  }
}
