import { test, expect } from '@playwright/test'
import { buildReport } from './build-report'

test.describe('buildReport', () => {
  test('computes a 100 health score when every journey passes', () => {
    const report = buildReport({
      surface: 'console',
      targetUrl: 'https://staging-console.mykka.ai',
      date: '2026-07-31',
      results: [
        { title: 'login', status: 'passed', durationMs: 1200, attachmentPaths: [] },
        { title: 'member invite', status: 'passed', durationMs: 900, attachmentPaths: [] },
      ],
    })

    expect(report).toContain('Health Score: 100/100')
    expect(report).toContain('None — all scripted journeys passed.')
  })

  test('lists each failure as a numbered issue with its error message and evidence', () => {
    const report = buildReport({
      surface: 'console',
      targetUrl: 'https://staging-console.mykka.ai',
      date: '2026-07-31',
      results: [
        { title: 'login', status: 'passed', durationMs: 1200, attachmentPaths: [] },
        {
          title: 'member invite',
          status: 'failed',
          durationMs: 500,
          errorMessage: 'Timed out waiting for locator "button[name=Invite]"',
          attachmentPaths: ['test-results/member-invite/trace.zip'],
        },
      ],
    })

    expect(report).toContain('Health Score: 50/100')
    expect(report).toContain('ISSUE-001: member invite')
    expect(report).toContain('Timed out waiting for locator')
    expect(report).toContain('test-results/member-invite/trace.zip')
  })

  test('reports a zero score with no crash when no journeys ran', () => {
    const report = buildReport({
      surface: 'console',
      targetUrl: 'https://staging-console.mykka.ai',
      date: '2026-07-31',
      results: [],
    })

    expect(report).toContain('Health Score: 0/100')
  })
})
