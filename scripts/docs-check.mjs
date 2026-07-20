import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const required = [
  'README.md', 'AGENTS.md', 'docs/index.md', 'docs/CURRENT_STATE.md',
  'docs/KNOWN_ISSUES.md', 'docs/ROADMAP.md',
  'docs/architecture/overview.md', 'docs/architecture/authentication.md',
  'docs/architecture/policy-and-enforcement.md', 'docs/architecture/data-flows.md',
  'docs/reference/repository-topology.md', 'docs/reference/commands.md',
  'docs/reference/configuration.md', 'docs/operations/local-development.md',
  'docs/operations/testing.md', 'docs/operations/deployment.md',
  'docs/operations/release-process.md', 'docs/archive/README.md',
  'backend/README.md', 'backend/AGENTS.md', 'pretzel/README.md', 'pretzel/AGENTS.md',
  'pretzel-console/README.md', 'pretzel-console/AGENTS.md',
  'mykka-web/README.md', 'mykka-web/AGENTS.md', 'e2e/README.md', 'scripts/README.md',
]
const entrypoints = new Set(['README.md', 'AGENTS.md', 'CLAUDE.md'])
const forbidden = [
  /root `playwright\.config\.ts`/i,
  /admin\/e2e\//i,
  /extension\/e2e\//i,
]
const errors = []

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    if (['node_modules', '.git', '.next', 'dist', 'test-results', 'playwright-report'].includes(name)) return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

for (const file of required) {
  if (!existsSync(join(root, file))) errors.push(`missing required document: ${file}`)
}

const markdown = walk(root).filter(file => file.endsWith('.md'))
for (const absolute of markdown) {
  const file = relative(root, absolute).replaceAll('\\', '/')
  const text = readFileSync(absolute, 'utf8')
  const archived = file.startsWith('docs/archive/')
  const authoritative = required.includes(file) && !entrypoints.has(file) && !archived
  if (authoritative) {
    for (const field of ['status:', 'owner:', 'verified_at:', 'sources:']) {
      if (!text.startsWith('---') || !text.includes(`\n${field}`)) errors.push(`${file}: missing frontmatter field ${field}`)
    }
  }
  const current = required.includes(file) || /^---\r?\n[\s\S]*?\r?\nstatus: current\r?\n/.test(text)
  if (current && !archived) {
    for (const pattern of forbidden) if (pattern.test(text)) errors.push(`${file}: contains forbidden stale reference ${pattern}`)
  }
  if (archived) continue
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0]
    if (!target || /^(https?:|mailto:|#)/.test(target)) continue
    const resolved = normalize(resolve(dirname(absolute), decodeURIComponent(target)))
    if (!existsSync(resolved)) errors.push(`${file}: broken link ${target}`)
    if (!archived && file !== 'docs/index.md' && resolved.includes(normalize(join(root, 'docs', 'archive')))) {
      errors.push(`${file}: active document links to archive ${target}`)
    }
  }
}

if (errors.length) {
  console.error(`Documentation check failed (${errors.length}):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log(`Documentation check passed: ${markdown.length} Markdown files scanned.`)
