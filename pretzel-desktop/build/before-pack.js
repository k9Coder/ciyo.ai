const fs = require('fs')
const path = require('path')

/**
 * electron-builder's own "file source doesn't exist" warning for a missing
 * extraResources entry is buried in normal build output and easy to miss —
 * the build succeeds either way, shipping an app whose local-judge spike
 * can never load, with no loud signal that happened. This hook makes that
 * visible without failing the build: a release that intentionally omits
 * the (git-ignored, experimental) model is still a valid thing to ship.
 */
exports.default = async function beforePack(context) {
  const modelFile = path.join(context.packager.info.appDir, 'resources', 'models', 'themis', 'onnx', 'themis.onnx')
  if (!fs.existsSync(modelFile)) {
    console.warn('')
    console.warn('================================================================')
    console.warn('  WARNING: Themis model not staged — resources/models/themis/')
    console.warn('  is missing or incomplete (expected: ' + modelFile + ').')
    console.warn('  This build will ship WITHOUT the local-judge spike model —')
    console.warn('  PRETZEL_LOCAL_JUDGE_POC will have nothing to load.')
    console.warn('  See electron/themis-judge.ts for regeneration commands.')
    console.warn('================================================================')
    console.warn('')
  }
}
