export type JourneyStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'

export interface JourneyResult {
  title: string
  status: JourneyStatus
  durationMs: number
  errorMessage?: string
  attachmentPaths: string[]
}

export interface BuildReportInput {
  surface: string
  targetUrl: string
  date: string
  results: JourneyResult[]
}

export function buildReport(input: BuildReportInput): string {
  const { surface, targetUrl, date, results } = input
  const total = results.length
  const passed = results.filter((r) => r.status === 'passed').length
  const failures = results.filter((r) => r.status === 'failed' || r.status === 'timedOut')
  const skipped = results.filter((r) => r.status === 'skipped' || r.status === 'interrupted').length
  const functionalScore = total > 0 ? Math.round((passed / total) * 100) : 0

  const lines: string[] = []
  lines.push(`# QA Report: ${surface}`)
  lines.push('')
  lines.push('| Field | Value |')
  lines.push('|-------|-------|')
  lines.push(`| **Date** | ${date} |`)
  lines.push(`| **Surface** | ${surface} |`)
  lines.push(`| **Target URL** | ${targetUrl} |`)
  lines.push('| **Mode** | Scripted journeys |')
  lines.push(`| **Journeys run** | ${total} |`)
  lines.push(`| **Passed** | ${passed} |`)
  lines.push(`| **Failed** | ${failures.length} |`)
  lines.push(`| **Skipped** | ${skipped} |`)
  lines.push('')
  lines.push(`## Health Score: ${functionalScore}/100`)
  lines.push('')
  lines.push('| Category | Score |')
  lines.push('|----------|-------|')
  lines.push(`| Functional | ${functionalScore} |`)
  lines.push('| Console | — (not measured by scripted journeys) |')
  lines.push('| Links | — (not measured by scripted journeys) |')
  lines.push('| Visual | — (not measured by scripted journeys) |')
  lines.push('| UX | — (not measured by scripted journeys) |')
  lines.push('| Performance | — (not measured by scripted journeys) |')
  lines.push('| Accessibility | — (not measured by scripted journeys) |')
  lines.push('')
  lines.push('Run `/qa-only` against the same target URL for exploratory coverage of the unmeasured categories.')
  lines.push('')
  lines.push('## Issues')
  lines.push('')

  if (failures.length === 0) {
    lines.push('None — all scripted journeys passed.')
  } else {
    failures.forEach((r, i) => {
      const n = String(i + 1).padStart(3, '0')
      lines.push(`### ISSUE-${n}: ${r.title}`)
      lines.push('')
      lines.push('| Field | Value |')
      lines.push('|-------|-------|')
      lines.push('| **Severity** | high |')
      lines.push('| **Category** | functional |')
      lines.push(`| **Status** | ${r.status} |`)
      lines.push(`| **Duration** | ${r.durationMs}ms |`)
      lines.push('')
      lines.push(`**Description:** ${r.errorMessage ?? 'Journey failed with no captured error message.'}`)
      lines.push('')
      if (r.attachmentPaths.length > 0) {
        lines.push('**Evidence:**')
        r.attachmentPaths.forEach((p) => lines.push(`- ${p}`))
        lines.push('')
      }
      lines.push('---')
      lines.push('')
    })
  }

  return lines.join('\n')
}
