/**
 * Manual, one-off verification that ThemisLocalJudge produces correct
 * verdicts with the real bundled model (not run in CI — the model files
 * are git-ignored). Run with: npx tsx scripts/verify-themis.ts
 *
 * electron/themis-judge.ts imports `app` from 'electron', which only exists
 * inside a running Electron process. This package has no "type": "module",
 * so tsx runs this script in CJS-interop mode — `import ... from 'electron'`
 * compiles to a plain `require('electron')`, which a Node ESM loader hook
 * (module.register()) does NOT intercept. Patching Module._load directly
 * (the classic CJS mocking technique) does.
 */
import Module from 'node:module'

type ModuleWithLoad = typeof Module & {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const moduleWithLoad = Module as ModuleWithLoad
const originalLoad = moduleWithLoad._load
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return { app: { isPackaged: false } }
  }
  return originalLoad.call(Module, request, parent, isMain)
}

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
