#!/usr/bin/env node
// Tags the current package.json version and pushes it, which triggers
// .github/workflows/pretzel-desktop-release.yml to build and publish the
// GitHub Release for macOS/Windows/Linux. Run pnpm bump-version first.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = join(__dirname, '..', 'package.json')

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const tag = `pretzel-desktop-v${pkg.version}`

const existingTags = execSync('git tag -l', { encoding: 'utf-8' }).split('\n').map(t => t.trim())
if (existingTags.includes(tag)) {
  console.error(`Tag ${tag} already exists — bump the version first: pnpm bump-version`)
  process.exit(1)
}

execSync(`git tag ${tag}`, { stdio: 'inherit' })
execSync(`git push origin ${tag}`, { stdio: 'inherit' })

console.log(`\nPushed ${tag} — GitHub Actions will build and publish the release (~10-15 min).`)
console.log('Watch progress: https://github.com/yarin-mag/mykka.ai/actions')
console.log(`Release will appear at: https://github.com/yarin-mag/mykka.ai/releases/tag/${tag}`)
