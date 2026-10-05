# Desktop Local Judge (Themis Parity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-proven Themis on-device judge model into `pretzel-desktop`, replacing `StubLocalJudge` in the shadow-mode local-judge spike, bringing desktop to parity with the extension (commit `c37099d` on `spike/local-judge-poc`).

**Architecture:** Reuse `@huggingface/transformers` (same library, same model, same tokenizer/vocab-remap logic as the extension's `pretzel/src/offscreen/themis-judge.ts`) but running under plain Node.js inside Electron's main process instead of a browser offscreen document — no WASM, no CSP, no CDN workaround needed, since Electron main is a real Node environment and the library uses `onnxruntime-node` (native binding) automatically there. Model files ship via electron-builder `extraResources` instead of a web `public/` directory.

**Tech Stack:** `@huggingface/transformers` ^4.3.0, `onnxruntime-node` (native dependency, installed transitively), Electron main process, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-local-judge-themis-design.md` (Section A — Desktop parity). This plan implements Section A only; B/C/D/E/F/G are separate future specs/plans per that doc.

## Global Constraints

- On-device only: model loading and inference must never make a network call (matches the spec's hard privacy requirement — same constraint the extension already satisfies).
- Shadow-mode only: this plan changes nothing about enforcement. `local-judge-poc.ts` stays gated behind `PRETZEL_LOCAL_JUDGE_POC=1`, fire-and-forget, never affects `evaluateRequest()`'s returned result.
- `LocalJudge` interface (`packages/detect/src/judge/types.ts`) is unchanged — `ThemisLocalJudge` must implement it exactly as-is: `classify(input: JudgeInput): Promise<JudgeVerdict>`, `isAvailable(): boolean`.
- Model weights (`themis.onnx`, `themis.onnx.data`) are git-ignored, local-only, same reasoning as `pretzel/public/models/` — regeneration commands documented in code, not assumed memorized.
- Tokenizer vocabulary is the full, unmodified 128,100-token DeBERTa-v3 tokenizer; the embedding table is pruned to 18,899 rows. `vocab_remap.json`'s `old_to_new` map must be applied to token ids after tokenization and before the embedding lookup — skipping this silently produces garbage predictions, not an error.

## Review Focus

- Missing model files in a fresh dev checkout (gitignored, not staged yet) — `isAvailable()` must return `false` and `classify()` must throw a clear error; it must not crash the Electron process or hang indefinitely.
- Packaged app resolves the model path differently than dev (`process.resourcesPath` vs. a relative project path) — a mistake here means dev testing passes while every packaged build silently never finds the model.
- `onnxruntime-node`'s native `.node` binary getting left inside the asar archive after packaging — Node's `dlopen` cannot load a native addon from inside an asar archive; this only breaks in a packaged build, never in dev, so it needs explicit `asarUnpack` config and a real packaged-build check, not just unit tests.
- Vocab remap applied incorrectly (wrong id, or the "unmapped id" fallback silently firing on normal tokens) — produces a confident-looking but meaningless verdict rather than an obvious crash.
- Two `classify()` calls arriving concurrently while the model is still loading — both must correctly await the same in-flight load and resolve, not race into a duplicate load or a spurious throw.

---

## Task 1: Add `@huggingface/transformers` dependency

**Files:**
- Modify: `pretzel-desktop/package.json`

**Interfaces:**
- Produces: `@huggingface/transformers` import available to later tasks.

- [ ] **Step 1: Add the dependencies**

In `pretzel-desktop/package.json`, add to `"dependencies"` (matching the extension's pinned version exactly):

```json
"@huggingface/transformers": "^4.3.0",
```

And to `"devDependencies"` — needed in Task 6 to run a standalone `.ts` verification script directly (this repo has no other way to execute a single TS file outside the Vitest/electron-vite build pipelines):

```json
"tsx": "^4.19.0",
```

- [ ] **Step 2: Install**

Run: `cd pretzel-desktop && pnpm install`
Expected: install succeeds, `node_modules/@huggingface/transformers` and `node_modules/onnxruntime-node` (transitive) both exist.

- [ ] **Step 3: Verify the native binding resolves**

Run: `node -e "require('onnxruntime-node'); console.log('ok')"` from `pretzel-desktop/`
Expected: prints `ok` — confirms the prebuilt native binary for this machine's platform loaded without error before any of our code depends on it.

- [ ] **Step 4: Commit**

```bash
cd pretzel-desktop
git add package.json pnpm-lock.yaml
git commit -m "chore(desktop): add @huggingface/transformers for the local-judge spike"
```

---

## Task 2: Resource-path resolution (dev vs. packaged)

**Files:**
- Create: `pretzel-desktop/electron/themis-judge.ts` (this task only adds `resolveModelDir`; later tasks add to this same file)
- Test: `pretzel-desktop/tests/unit/themis-judge.test.ts`

**Interfaces:**
- Produces: `export function resolveModelDir(): string` — absolute path to the directory containing `themis`'s `config.json`/`tokenizer.json`/`onnx/`.

- [ ] **Step 1: Write the failing test**

```typescript
// pretzel-desktop/tests/unit/themis-judge.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import path from 'node:path'

const { mockIsPackaged } = vi.hoisted(() => ({ mockIsPackaged: vi.fn(() => false) }))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockIsPackaged()
    },
  },
}))

import { resolveModelDir } from '../../electron/themis-judge'

describe('resolveModelDir', () => {
  afterEach(() => {
    mockIsPackaged.mockReset()
    mockIsPackaged.mockReturnValue(false)
  })

  it('resolves relative to the project in dev (app.isPackaged = false)', () => {
    mockIsPackaged.mockReturnValue(false)
    const dir = resolveModelDir()
    expect(dir).toBe(path.join(__dirname, '../../resources/models/themis'))
  })

  it('resolves under process.resourcesPath when packaged', () => {
    mockIsPackaged.mockReturnValue(true)
    const originalResourcesPath = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', { value: '/Applications/Pretzel.app/Contents/Resources', configurable: true })
    const dir = resolveModelDir()
    expect(dir).toBe(path.join('/Applications/Pretzel.app/Contents/Resources', 'models', 'themis'))
    Object.defineProperty(process, 'resourcesPath', { value: originalResourcesPath, configurable: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pretzel-desktop && npx vitest run tests/unit/themis-judge.test.ts`
Expected: FAIL — `themis-judge.ts` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// pretzel-desktop/electron/themis-judge.ts
import path from 'node:path'
import { app } from 'electron'

export function resolveModelDir(): string {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'models')
    : path.join(__dirname, '../resources/models')
  return path.join(base, 'themis')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pretzel-desktop && npx vitest run tests/unit/themis-judge.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
cd pretzel-desktop
git add electron/themis-judge.ts tests/unit/themis-judge.test.ts
git commit -m "feat(desktop): add dev/packaged model path resolution for local judge"
```

---

## Task 3: Vocab remap and softmax (pure logic)

**Files:**
- Modify: `pretzel-desktop/electron/themis-judge.ts`
- Modify: `pretzel-desktop/tests/unit/themis-judge.test.ts`

**Interfaces:**
- Consumes: nothing from Task 2 directly (independent pure functions in the same file).
- Produces: `export interface VocabRemap { old_to_new: Record<string, number>; fallback_new_id: number }`, `export function remapIds(ids: Iterable<bigint>, remap: VocabRemap): BigInt64Array`, `export function softmax(xs: Float32Array | number[]): number[]`.

- [ ] **Step 1: Write the failing tests**

```typescript
// append to pretzel-desktop/tests/unit/themis-judge.test.ts
import { remapIds, softmax, type VocabRemap } from '../../electron/themis-judge'

describe('remapIds', () => {
  it('maps known old ids to their new ids', () => {
    const remap: VocabRemap = { old_to_new: { '5': 2, '100': 7 }, fallback_new_id: 3 }
    const result = remapIds([5n, 100n], remap)
    expect(Array.from(result)).toEqual([2n, 7n])
  })

  it('falls back to fallback_new_id for an id with no mapping', () => {
    const remap: VocabRemap = { old_to_new: { '5': 2 }, fallback_new_id: 3 }
    const result = remapIds([5n, 999999n], remap)
    expect(Array.from(result)).toEqual([2n, 3n])
  })

  it('returns a BigInt64Array', () => {
    const remap: VocabRemap = { old_to_new: { '1': 1 }, fallback_new_id: 0 }
    const result = remapIds([1n], remap)
    expect(result).toBeInstanceOf(BigInt64Array)
  })
})

describe('softmax', () => {
  it('sums to 1', () => {
    const probs = softmax([1, 2, 3])
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })

  it('gives the larger logit the larger probability', () => {
    const probs = softmax([0.1, 5.0])
    expect(probs[1]).toBeGreaterThan(probs[0])
  })

  it('handles equal logits as equal probabilities', () => {
    const probs = softmax([2, 2])
    expect(probs[0]).toBeCloseTo(probs[1], 10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pretzel-desktop && npx vitest run tests/unit/themis-judge.test.ts`
Expected: FAIL — `remapIds`/`softmax`/`VocabRemap` not exported yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// add to pretzel-desktop/electron/themis-judge.ts, below resolveModelDir
export interface VocabRemap {
  old_to_new: Record<string, number>
  fallback_new_id: number
}

export function remapIds(ids: Iterable<bigint>, remap: VocabRemap): BigInt64Array {
  const { old_to_new, fallback_new_id } = remap
  return BigInt64Array.from(ids, (id) => {
    const mapped = old_to_new[String(id)]
    return BigInt(mapped ?? fallback_new_id)
  })
}

export function softmax(xs: Float32Array | number[]): number[] {
  const max = Math.max(...xs)
  const exps = Array.from(xs, (x) => Math.exp(x - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / sum)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pretzel-desktop && npx vitest run tests/unit/themis-judge.test.ts`
Expected: PASS, 8 tests total (2 from Task 2 + 6 here, matches the full file so far: Task 2 added 2, this task adds 6).

- [ ] **Step 5: Commit**

```bash
cd pretzel-desktop
git add electron/themis-judge.ts tests/unit/themis-judge.test.ts
git commit -m "feat(desktop): add vocab-remap and softmax helpers for local judge"
```

---

## Task 4: `ThemisLocalJudge` class and the model-missing error path

**Files:**
- Modify: `pretzel-desktop/electron/themis-judge.ts`
- Modify: `pretzel-desktop/tests/unit/themis-judge.test.ts`

**Interfaces:**
- Consumes: `resolveModelDir` (Task 2), `remapIds`/`softmax`/`VocabRemap` (Task 3), `LocalJudge`/`JudgeInput`/`JudgeVerdict` from `@mykka/detect` (existing).
- Produces: `export class ThemisLocalJudge implements LocalJudge`.

This task writes the real class but tests only the failure path that's actually testable without the ~140MB model present (which is git-ignored and won't exist in a CI checkout). The real-inference path is verified manually in Task 6, against the real bundled files, the same way the extension's Themis swap was verified in a real browser rather than by a committed automated test.

- [ ] **Step 1: Write the failing test**

```typescript
// append to pretzel-desktop/tests/unit/themis-judge.test.ts
describe('ThemisLocalJudge', () => {
  it('isAvailable() is false before the model loads (e.g. files missing in this checkout)', async () => {
    const { ThemisLocalJudge } = await import('../../electron/themis-judge')
    const judge = new ThemisLocalJudge()
    // In a fresh checkout the gitignored resources/models/themis files don't
    // exist, so the background load this module kicks off at import time
    // will have already failed by the time this test runs.
    expect(judge.isAvailable()).toBe(false)
  })

  it('classify() rejects with a clear error when the model never loaded', async () => {
    const { ThemisLocalJudge } = await import('../../electron/themis-judge')
    const judge = new ThemisLocalJudge()
    await expect(judge.classify({ text: 'hello', prompt: 'does this match anything' })).rejects.toBeTruthy()
  })

  it('two concurrent classify() calls both reject consistently, not racing into a duplicate load attempt', async () => {
    const { ThemisLocalJudge } = await import('../../electron/themis-judge')
    const judge = new ThemisLocalJudge()
    const [first, second] = await Promise.allSettled([
      judge.classify({ text: 'hello', prompt: 'does this match anything' }),
      judge.classify({ text: 'world', prompt: 'does this match anything else' }),
    ])
    expect(first.status).toBe('rejected')
    expect(second.status).toBe('rejected')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pretzel-desktop && npx vitest run tests/unit/themis-judge.test.ts`
Expected: FAIL — `ThemisLocalJudge` not exported yet.

- [ ] **Step 3: Write minimal implementation**

Append the following to the existing `pretzel-desktop/electron/themis-judge.ts` from Tasks 2-3 — add these new imports alongside the existing `path`/`app` imports at the top of the file, and add everything else (the module-level `loading` promise and the `ThemisLocalJudge` class) at the bottom, below the existing `resolveModelDir`/`remapIds`/`softmax`:

```typescript
import { readFile } from 'node:fs/promises'
import {
  AutoTokenizer,
  AutoModelForSequenceClassification,
  Tensor,
  env as transformersEnv,
  type PreTrainedTokenizer,
  type PreTrainedModel,
} from '@huggingface/transformers'
import type { JudgeInput, JudgeVerdict, LocalJudge } from '@mykka/detect'

const MAX_LENGTH = 96
// Label 1 is "match" — same label encoding as the extension's themis-judge.ts
// and models/themis/README.md's training recipe.
const MATCH_LABEL_INDEX = 1

let tokenizer: PreTrainedTokenizer | null = null
let model: PreTrainedModel | null = null
let vocabRemap: VocabRemap | null = null
let loadError: unknown = null

// Kick off loading at module import time, same rationale as the extension's
// offscreen judge: give the model a head start before the first real
// classify() call arrives.
const loading: Promise<void> = (async () => {
  const modelDir = resolveModelDir()
  transformersEnv.allowLocalModels = true
  transformersEnv.allowRemoteModels = false
  // transformers.js string-joins this with the model id and filename — a
  // trailing slash matters, mixed path separators on Windows don't (Node's
  // fs accepts both).
  transformersEnv.localModelPath = modelDir + '/'

  const [tok, mdl, remapText] = await Promise.all([
    AutoTokenizer.from_pretrained('themis'),
    AutoModelForSequenceClassification.from_pretrained('themis', {
      dtype: 'fp32',
      device: 'cpu',
      // The exported file is named themis.onnx/.onnx.data, not the
      // transformers.js default model[_<dtype>].onnx convention.
      model_file_name: 'themis',
      session_options: {
        externalData: [{ path: 'themis.onnx.data', data: 'onnx/themis.onnx.data' }],
      },
    }),
    readFile(path.join(modelDir, 'vocab_remap.json'), 'utf8'),
  ])
  tokenizer = tok
  model = mdl
  vocabRemap = JSON.parse(remapText) as VocabRemap
})().catch((err: unknown) => {
  loadError = err
  console.error('[local-judge-poc:desktop] themis model load failed', err)
})

export class ThemisLocalJudge implements LocalJudge {
  isAvailable(): boolean {
    return model !== null && tokenizer !== null && vocabRemap !== null
  }

  async classify(input: JudgeInput): Promise<JudgeVerdict> {
    await loading
    if (!model || !tokenizer || !vocabRemap) {
      throw loadError ?? new Error('themis judge model failed to load')
    }

    // Training shape: [CLS] message [SEP] rule claim [SEP] — message first,
    // rule prompt as text_pair.
    const encoded = tokenizer(input.text, {
      text_pair: input.prompt,
      padding: 'max_length',
      truncation: true,
      max_length: MAX_LENGTH,
    }) as { input_ids: Tensor; attention_mask: Tensor }

    const remapped = remapIds(encoded.input_ids.data as BigInt64Array, vocabRemap)
    const inputIds = new Tensor('int64', remapped, encoded.input_ids.dims)

    const { logits } = (await model({ input_ids: inputIds, attention_mask: encoded.attention_mask })) as {
      logits: Tensor
    }
    const probs = softmax(logits.data as Float32Array)
    const matchProb = probs[MATCH_LABEL_INDEX]

    return matchProb >= 0.5
      ? { verdict: 'match', confidence: matchProb }
      : { verdict: 'no_match', confidence: 1 - matchProb }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pretzel-desktop && npx vitest run tests/unit/themis-judge.test.ts`
Expected: PASS, 11 tests total (2 from Task 2 + 6 from Task 3 + 3 here). (In this checkout the model files genuinely don't exist yet — Task 6 stages them — so `loading` rejects for real and these two tests exercise the actual failure path, not a mock.)

- [ ] **Step 5: Typecheck**

Run: `cd pretzel-desktop && npm run typecheck`
Expected: no new errors from `electron/themis-judge.ts`.

- [ ] **Step 6: Commit**

```bash
cd pretzel-desktop
git add electron/themis-judge.ts tests/unit/themis-judge.test.ts
git commit -m "feat(desktop): add ThemisLocalJudge with model-missing error path covered"
```

---

## Task 5: Stage model files, electron-builder packaging config

**Files:**
- Create: `pretzel-desktop/resources/models/themis/` (git-ignored — config.json, tokenizer.json, tokenizer_config.json, vocab_remap.json, onnx/themis.onnx, onnx/themis.onnx.data)
- Modify: `pretzel-desktop/build/electron-builder.yml`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Consumes: `resolveModelDir()` (Task 2) — this task makes its packaged-build branch correct by matching electron-builder's `extraResources` output layout.

- [ ] **Step 1: Stage the model files from the extension's already-verified copy**

`models/themis/` in the repo root only has the README + reproduction scripts tracked (the weights are git-ignored there too). Copy from the extension's working copy instead — `pretzel/public/models/themis/`, the exact files already verified correct in a real browser (commit `c37099d`):

```bash
cd pretzel-desktop
mkdir -p resources/models/themis/onnx
cp ../pretzel/public/models/themis/config.json resources/models/themis/
cp ../pretzel/public/models/themis/tokenizer.json resources/models/themis/
cp ../pretzel/public/models/themis/tokenizer_config.json resources/models/themis/
cp ../pretzel/public/models/themis/vocab_remap.json resources/models/themis/
cp ../pretzel/public/models/themis/onnx/themis.onnx resources/models/themis/onnx/
cp ../pretzel/public/models/themis/onnx/themis.onnx.data resources/models/themis/onnx/
```

Expected: `pretzel-desktop/resources/models/themis/` now mirrors the extension's model directory exactly (same files, no WASM runtime needed here — desktop uses the native `onnxruntime-node` binding, not WASM).

- [ ] **Step 2: Gitignore the staged weights, same reasoning as the extension's**

In the repo root `.gitignore`, extend the existing comment block:

```
# Themis model bundled for the desktop local-judge PoC, same reasoning and
# regeneration source as pretzel/public/models/ above.
pretzel-desktop/resources/models/
```

- [ ] **Step 3: Add `extraResources` to electron-builder.yml**

In `pretzel-desktop/build/electron-builder.yml`, add a top-level key (alongside `directories`, `files`, etc.):

```yaml
extraResources:
  - from: resources/models
    to: models
```

This copies `resources/models/themis/**` into `process.resourcesPath/models/themis/**` in every packaged build (mac/win/linux), matching `resolveModelDir()`'s packaged-mode branch from Task 2.

- [ ] **Step 4: Add `asarUnpack` for the native ONNX Runtime binary**

In the same file, add:

```yaml
asarUnpack:
  - node_modules/onnxruntime-node/**/*
```

Node's `dlopen` cannot load a native `.node` addon from inside an asar archive — without this, `onnxruntime-node` loads fine in dev (no asar involved) and silently fails only in a packaged build. Scoped to only this package, not touching any other native dependency's existing (already-working) packaging.

- [ ] **Step 5: Verify the YAML is still valid**

Run: `cd pretzel-desktop && node -e "require('js-yaml').load(require('fs').readFileSync('build/electron-builder.yml', 'utf8')); console.log('valid')"`

If `js-yaml` isn't a direct dependency, use electron-builder's own config validation instead:

Run: `cd pretzel-desktop && npx electron-builder --help >/dev/null && echo "electron-builder config will be validated on next build invocation"`

Expected: no YAML syntax errors reported on the next actual `npm run package` build (Task 6 covers running a real build).

- [ ] **Step 6: Commit**

```bash
git add .gitignore pretzel-desktop/build/electron-builder.yml
git commit -m "feat(desktop): package the Themis model via extraResources, unpack onnxruntime-node from asar"
```

Note: the staged `resources/models/themis/` files are git-ignored by design (Step 2) and are not part of this commit — same pattern as the extension's `public/models/`.

---

## Task 6: Wire into `local-judge-poc.ts`, verify real inference and a real packaged build

**Files:**
- Modify: `pretzel-desktop/electron/local-judge-poc.ts`

**Interfaces:**
- Consumes: `ThemisLocalJudge` (Task 4).

- [ ] **Step 1: Swap the judge implementation**

In `pretzel-desktop/electron/local-judge-poc.ts`:

```typescript
// Replace this line:
import { StubLocalJudge, POC_JUDGE_RULES, type LocalJudge } from '@mykka/detect'
// with:
import { POC_JUDGE_RULES, type LocalJudge } from '@mykka/detect'
import { ThemisLocalJudge } from './themis-judge'

// Replace this line:
const judge: LocalJudge = new StubLocalJudge()
// with:
const judge: LocalJudge = new ThemisLocalJudge()
```

Also update the file's header comment (currently says "swapped from StubLocalJudge to a real on-device model (Jev or a stand-in) once the wiring proven here holds up") to reflect that this has now happened — mirror the extension's `offscreen.ts` comment style:

```typescript
/**
 * Shadow-mode wiring for the local-judge PoC (branch: spike/local-judge-poc).
 *
 * Runs judge-prompt test rules against the same text the DETECT handler
 * already inspects, and only LOGS verdicts — never affects the returned
 * DetectionResult, never blocks/warns. Gated on PRETZEL_LOCAL_JUDGE_POC=1.
 *
 * Uses ThemisLocalJudge (DeBERTa-v3-small, fine-tuned + vocabulary-pruned,
 * same model as the extension's offscreen/themis-judge.ts) running natively
 * via onnxruntime-node — no WASM, no browser sandbox, since this runs
 * directly in Electron's main process.
 */
```

- [ ] **Step 2: Typecheck**

Run: `cd pretzel-desktop && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run the full unit suite**

Run: `cd pretzel-desktop && npm test`
Expected: all tests pass, including the Task 2/3/4 tests in `themis-judge.test.ts` (the model-missing-error tests from Task 4 now legitimately exercise the real failure path if you haven't completed Task 5's staging yet in this shell, or the real success path if you have — both are valid depending on checkout state, but `isAvailable()` must not throw either way).

- [ ] **Step 4: Manual real-inference verification (after Task 5's staging)**

This can't be a committed automated test — the ~140MB model files are git-ignored and won't exist in CI. `electron/themis-judge.ts` imports from `electron`, which only resolves inside a running Electron process, so this needs a small standalone script with `electron` mocked, run directly via `tsx` (added in Task 1), the same spirit as the extension's real-browser verification rather than a CI-gated test.

Create `pretzel-desktop/scripts/verify-themis.ts`:

```typescript
/**
 * Manual, one-off verification that ThemisLocalJudge produces correct
 * verdicts with the real bundled model (not run in CI — the model files
 * are git-ignored). Run with: npx tsx scripts/verify-themis.ts
 */
import { register } from 'node:module'
import path from 'node:path'

// electron/themis-judge.ts imports `app` from 'electron', which only exists
// inside a running Electron process. Stub it for this standalone script,
// forcing the dev-mode (unpackaged) branch of resolveModelDir().
;(globalThis as Record<string, unknown>).__electronMock = { app: { isPackaged: false } }
register(new URL('./electron-stub-loader.mjs', `file://${path.resolve(__dirname)}/`).href)

async function main() {
  const { ThemisLocalJudge } = await import('../electron/themis-judge')
  const judge = new ThemisLocalJudge()

  const cases: Array<[string, string, 'match' | 'no_match']> = [
    [
      'my ssn is five five five, twelve, three four five six',
      'This message discloses a Social Security Number, even if disguised or spelled out.',
      'match',
    ],
    [
      'can you write me a short poem about the ocean',
      'This message discloses a Social Security Number, even if disguised or spelled out.',
      'no_match',
    ],
  ]

  let failures = 0
  for (const [text, prompt, expected] of cases) {
    const verdict = await judge.classify({ text, prompt })
    const ok = verdict.verdict === expected
    if (!ok) failures++
    console.log(`${ok ? 'OK  ' : 'FAIL'} expected=${expected} got=${verdict.verdict} confidence=${verdict.confidence.toFixed(3)} "${text.slice(0, 40)}"`)
  }
  if (failures > 0) {
    console.error(`${failures} case(s) failed`)
    process.exit(1)
  }
}

main()
```

Create `pretzel-desktop/scripts/electron-stub-loader.mjs` (a Node module loader hook that redirects any `import ... from 'electron'` to the mock set on `globalThis` above — needed because `electron` isn't installed as a real importable package outside an actual Electron process):

```javascript
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron') {
    return { url: 'electron-stub:', shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url === 'electron-stub:') {
    return {
      format: 'module',
      shortCircuit: true,
      source: `export const app = globalThis.__electronMock.app;`,
    }
  }
  return nextLoad(url, context)
}
```

Run:

```bash
cd pretzel-desktop
npx tsx scripts/verify-themis.ts
```

Expected: both cases print `OK`, confidences in the same range as the extension's verified run (~0.97-0.99 for both these cases — see commit `c37099d`'s message for the exact reference numbers), exit code 0.

- [ ] **Step 5: Manual packaged-build verification**

```bash
cd pretzel-desktop
npm run package
```

Expected: build succeeds, and the produced app (unzip/mount the platform output under `release/<version>/`) contains `resources/models/themis/onnx/themis.onnx` and an unpacked (not inside `app.asar`) `onnxruntime-node` native binary — confirm by inspecting `release/<version>/**/resources/` directly, or by actually launching the packaged app with `PRETZEL_LOCAL_JUDGE_POC=1` set and checking the log output from `runLocalJudgePoc` for a real verdict instead of a load error.

- [ ] **Step 6: Commit**

```bash
cd pretzel-desktop
git add electron/local-judge-poc.ts scripts/verify-themis.ts scripts/electron-stub-loader.mjs
git commit -m "spike(local-judge): swap desktop's StubLocalJudge for ThemisLocalJudge"
```
