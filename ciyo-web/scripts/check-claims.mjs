import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT_DIRS = ['app', 'components', 'lib']
const CONTENT_EXTENSIONS = new Set(['.js', '.jsx', '.md', '.mjs', '.ts', '.tsx'])
const EXCLUDED_FILES = new Set(['CONTENT_CLAIMS.md'])

export const PROHIBITED_PATTERNS = [
  { label: 'unsupported customer-count claim', pattern: /\b\d+\+?\s+(?:companies|customers|teams|organizations)\b/i },
  { label: 'unsupported payment-provider claim', pattern: /\b(?:processed by|powered by|integrates? with)\s+Stripe\b/i },
  { label: 'unsupported universal AI-site claim', pattern: /\b(?:all|any|every)\s+(?:AI\s+)?(?:site|sites|tool|tools|destination|destinations)\b/i },
  { label: 'unsupported no-card claim', pattern: /\bno\s+credit\s+card\b/i },
  { label: 'unsupported install-time claim', pattern: /\b(?:installs?|setup|takes?)\s+(?:in\s+)?\d+\s+(?:seconds?|minutes?)\b/i },
  { label: 'unsupported SOC claim', pattern: /\bSOC\s*2\b/i },
  { label: 'unsupported GDPR/CCPA claim', pattern: /\b(?:GDPR|CCPA)(?:[-\s&/]+(?:aligned|ready|compliant|compliance|CCPA|GDPR))?\b/i },
  { label: 'unsupported TLS claim', pattern: /\bTLS\s*1\.3\b/i },
  { label: 'unsupported encryption claim', pattern: /\bAES[-\s]?256\b/i },
  { label: 'unsupported residency claim', pattern: /\b(?:eu-west-1|data\s+residency|residency\s+region)\b/i },
  { label: 'unsupported SLA claim', pattern: /\b(?:formal\s+)?SLA(?:s)?\b/i },
  { label: 'unsupported alerting/integration claim', pattern: /\b(?:Slack\s+alert|SIEM\s+integration|SSO\s*\/\s*SAML|SAML\s+SSO|on-premise\s+policy)\b/i },
  { label: 'unsupported prompt-stat claim', pattern: /\b\d[\d,]*\s+AI\s+prompts?\b/i },
  { label: 'unsupported risk-stat claim', pattern: /\b(?:roughly\s+)?1\s+in\s+\d+\b/i },
  { label: 'unsupported funding/pricing claim', pattern: /\b(?:customer-funded|included\s+on\s+all\s+plans)\b/i },
]

async function listContentFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async entry => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listContentFiles(fullPath)
    if (!CONTENT_EXTENSIONS.has(path.extname(entry.name))) return []
    return [fullPath]
  }))
  return files.flat()
}

export async function scanFiles(files) {
  const violations = []
  for (const file of files) {
    const absolutePath = path.resolve(ROOT, file)
    if (EXCLUDED_FILES.has(path.basename(absolutePath))) continue
    const content = await readFile(absolutePath, 'utf8')
    for (const { label, pattern } of PROHIBITED_PATTERNS) {
      const match = content.match(pattern)
      if (!match || match.index === undefined) continue
      const line = content.slice(0, match.index).split(/\r?\n/).length
      violations.push({ file: path.relative(ROOT, absolutePath), line, label, match: match[0] })
    }
  }
  return violations
}

async function main() {
  const files = (await Promise.all(CONTENT_DIRS.map(directory => listContentFiles(path.join(ROOT, directory))))).flat()
  const violations = await scanFiles(files)
  if (violations.length === 0) {
    console.log(`Claims check passed (${files.length} source files scanned).`)
    return
  }
  console.error('Claims check failed. Remove or register replacement wording for these unsupported claim families:')
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line}: ${violation.label} ("${violation.match}")`)
  }
  process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
