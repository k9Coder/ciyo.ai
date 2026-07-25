#!/usr/bin/env node
// Bumps pretzel-desktop's package.json version and commits the change.
// Usage: pnpm bump-version [patch|minor|major]  (defaults to patch)
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = join(__dirname, '..', 'package.json')

const bumpType = process.argv[2] ?? 'patch'
const VALID_TYPES = ['patch', 'minor', 'major']
if (!VALID_TYPES.includes(bumpType)) {
  console.error(`Unknown bump type "${bumpType}" — use one of: ${VALID_TYPES.join(', ')}`)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const [major, minor, patch] = pkg.version.split('.').map(Number)

const next =
  bumpType === 'major' ? `${major + 1}.0.0` :
  bumpType === 'minor' ? `${major}.${minor + 1}.0` :
  `${major}.${minor}.${patch + 1}`

pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

execSync('git add package.json', { stdio: 'inherit' })
execSync(`git commit -m "chore: bump pretzel-desktop to v${next}"`, { stdio: 'inherit' })

console.log(`\nBumped pretzel-desktop to v${next} and committed.`)
console.log('Next: pnpm release')
