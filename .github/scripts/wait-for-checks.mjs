const token = process.env.GITHUB_TOKEN
const repository = process.env.GITHUB_REPOSITORY
const sha = process.env.GITHUB_SHA
const runId = process.env.GITHUB_RUN_ID
const requiredChecks = (process.env.REQUIRED_CHECKS ?? '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
const timeoutMs = Number(process.env.CHECK_TIMEOUT_MS ?? 30 * 60 * 1000)
const intervalMs = Number(process.env.CHECK_INTERVAL_MS ?? 15 * 1000)

if (!token || !repository || !sha || requiredChecks.length === 0) {
  console.error('GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA, and REQUIRED_CHECKS are required')
  process.exit(2)
}

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
}

async function listCheckRuns() {
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/${sha}/check-runs?per_page=100`, { headers })
  if (!response.ok) {
    throw new Error(`GitHub check-runs request failed: ${response.status} ${await response.text()}`)
  }
  const body = await response.json()
  return body.check_runs ?? []
}

function latestByName(checkRuns) {
  const byName = new Map()
  for (const run of checkRuns) {
    if (String(run.id) === String(runId)) continue
    const previous = byName.get(run.name)
    if (!previous || new Date(run.started_at ?? run.created_at) > new Date(previous.started_at ?? previous.created_at)) {
      byName.set(run.name, run)
    }
  }
  return byName
}

const startedAt = Date.now()

while (Date.now() - startedAt < timeoutMs) {
  const checks = latestByName(await listCheckRuns())
  const missing = []
  const pending = []
  const failed = []

  for (const name of requiredChecks) {
    const check = checks.get(name)
    if (!check) {
      missing.push(name)
      continue
    }
    if (check.status !== 'completed') {
      pending.push(`${name} (${check.status})`)
      continue
    }
    if (check.conclusion !== 'success' && check.conclusion !== 'skipped') {
      failed.push(`${name} (${check.conclusion})`)
    }
  }

  if (failed.length > 0) {
    console.error(`Required checks failed for ${sha}: ${failed.join(', ')}`)
    process.exit(1)
  }

  if (missing.length === 0 && pending.length === 0) {
    console.log(`Required checks passed for ${sha}: ${requiredChecks.join(', ')}`)
    process.exit(0)
  }

  console.log(`Waiting for required checks on ${sha}. Missing: ${missing.join(', ') || 'none'}. Pending: ${pending.join(', ') || 'none'}.`)
  await new Promise(resolve => setTimeout(resolve, intervalMs))
}

console.error(`Timed out waiting for required checks on ${sha}: ${requiredChecks.join(', ')}`)
process.exit(1)
