/**
 * Real RAM measurement for ThemisLocalJudge, same CJS-interop shim as
 * verify-themis.ts. Reports actual process.memoryUsage() deltas, not
 * estimates — for sizing the vocab-widening option (#2 in the accuracy
 * discussion) before committing to it.
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

function snap(label: string) {
  if (global.gc) global.gc()
  const m = process.memoryUsage()
  console.log(`${label}: rss=${(m.rss/1024/1024).toFixed(1)}MB heapUsed=${(m.heapUsed/1024/1024).toFixed(1)}MB external=${(m.external/1024/1024).toFixed(1)}MB arrayBuffers=${(m.arrayBuffers/1024/1024).toFixed(1)}MB`)
  return m
}

async function main() {
  const before = snap('before import')

  const { ThemisLocalJudge } = await import('../electron/themis-judge')
  const afterImport = snap('after import (module loaded, no instance yet)')

  const judge = new ThemisLocalJudge()
  const afterConstruct = snap('after construct (session likely created here)')

  // isAvailable()/first classify() may lazily finish init — force a real call.
  await judge.classify({ text: 'hello world, nothing sensitive here', prompt: 'This message discloses a Social Security Number.' })
  const afterFirstCall = snap('after first classify() call')

  for (let i = 0; i < 5; i++) {
    await judge.classify({ text: `test message number ${i} with some padding text to look realistic`, prompt: 'This message discloses a Social Security Number.' })
  }
  const afterFiveMore = snap('after 5 more classify() calls')

  console.log('\n--- deltas vs before ---')
  console.log(`rss delta after import:        ${((afterImport.rss - before.rss)/1024/1024).toFixed(1)}MB`)
  console.log(`rss delta after construct:     ${((afterConstruct.rss - before.rss)/1024/1024).toFixed(1)}MB`)
  console.log(`rss delta after first call:    ${((afterFirstCall.rss - before.rss)/1024/1024).toFixed(1)}MB`)
  console.log(`rss delta after 6 total calls: ${((afterFiveMore.rss - before.rss)/1024/1024).toFixed(1)}MB`)
}

main()
