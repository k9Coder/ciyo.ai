import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { buildReport, JourneyResult } from './build-report'

const OUTPUT_DIR = path.resolve(__dirname, '../../../.gstack/qa-reports')

export default class QaReportReporter implements Reporter {
  private resultsByProject = new Map<string, JourneyResult[]>()
  private urlsByProject = new Map<string, string>()

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()
    const projectName = project?.name ?? 'unknown'
    // 'unit' is the reporter's own formatter tests, not a QA journey — skip it.
    if (projectName === 'unit' || projectName.endsWith('-setup')) return

    const baseURL = project?.use.baseURL as string | undefined
    if (baseURL) this.urlsByProject.set(projectName, baseURL)

    const list = this.resultsByProject.get(projectName) ?? []
    list.push({
      title: test.parent.title ? `${test.parent.title} > ${test.title}` : test.title,
      status: result.status,
      durationMs: result.duration,
      errorMessage: result.errors[0]?.message,
      attachmentPaths: result.attachments
        .map((a) => a.path)
        .filter((p): p is string => Boolean(p)),
    })
    this.resultsByProject.set(projectName, list)
  }

  onEnd(): void {
    if (this.resultsByProject.size === 0) return
    mkdirSync(OUTPUT_DIR, { recursive: true })
    const date = new Date().toISOString().slice(0, 10)
    for (const [surface, results] of this.resultsByProject) {
      const report = buildReport({
        surface,
        targetUrl: this.urlsByProject.get(surface) ?? 'unknown',
        date,
        results,
      })
      const filePath = path.join(OUTPUT_DIR, `qa-report-${surface}-${date}.md`)
      writeFileSync(filePath, report, 'utf-8')
    }
  }
}
