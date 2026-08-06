import { test, expect, type Page } from '@playwright/test'

// Semantic selector for the action column badge.
// The audit table renders each action as a <span data-testid="event-action"> inside
// the action cell. Using this instead of `td:nth-child(4) span` means the selector
// is immune to column reordering or insertion.
const ACTION_BADGE = '[data-testid="event-action"]'

// Fixed timestamps (newest first) so the before-cursor pagination is deterministic.
const T0 = 1_750_000_000_000
const MOCK_EVENTS = [
  ...Array.from({ length: 8 }, (_, i) => ({
    id:          `block-${i}`,
    memberEmail: `user${i}@example.com`,
    subjectName: 'ACME Confidential',
    ruleKind:    'keyword',
    action:      'block' as const,
    siteUrl:     'https://chatgpt.com/',
    matchedTerm: 'ACME_SECRET',
    occurredAt:  new Date(T0 - i * 60_000).toISOString(),
  })),
  ...Array.from({ length: 7 }, (_, i) => ({
    id:          `warn-${i}`,
    memberEmail: `user${i + 8}@example.com`,
    subjectName: 'ACME Confidential',
    ruleKind:    'keyword',
    action:      'warn' as const,
    siteUrl:     'https://claude.ai/',
    matchedTerm: 'ACME_WARN',
    occurredAt:  new Date(T0 - (8 + i) * 60_000).toISOString(),
  })),
]

async function mockAuditLog(page: Page, forcedLimit?: number) {
  await page.route('**/v1/audit-log**', route => {
    const url    = new URL(route.request().url())
    const action = url.searchParams.get('action') as 'warn' | 'block' | null
    const limit  = forcedLimit ?? parseInt(url.searchParams.get('limit') ?? '50', 10)
    const before = url.searchParams.get('before')

    let events = MOCK_EVENTS
    if (action)  events = events.filter(e => e.action === action)
    if (before)  events = events.filter(e => e.occurredAt < before)

    const hasMore    = events.length > limit
    const pageEvents = events.slice(0, limit)

    route.fulfill({
      status:      200,
      contentType: 'application/json',
      body:        JSON.stringify({
        entries:    pageEvents,
        nextBefore: hasMore ? pageEvents[pageEvents.length - 1]!.occurredAt : null,
      }),
    })
  })
}

test.describe('Audit Log', () => {
  test('page loads and renders event rows', async ({ page }) => {
    await mockAuditLog(page)
    await page.goto('/audit-log')

    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBeGreaterThan(1)
  })

  test('filter pill Blocked shows only block events', async ({ page }) => {
    await mockAuditLog(page)
    await page.goto('/audit-log')

    await page.getByRole('button', { name: 'Blocked' }).click()

    // Use semantic data-testid selector instead of fragile positional td:nth-child(4)
    const actionCells = page.locator(ACTION_BADGE)
    await expect(actionCells.first()).toBeVisible()
    const texts = await actionCells.allTextContents()
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.every(t => t === 'block')).toBe(true)
  })

  test('filter pill Warned shows only warn events', async ({ page }) => {
    await mockAuditLog(page)
    await page.goto('/audit-log')

    await page.getByRole('button', { name: 'Warned' }).click()

    // Use semantic data-testid selector instead of fragile positional td:nth-child(4)
    const actionCells = page.locator(ACTION_BADGE)
    await expect(actionCells.first()).toBeVisible()
    const texts = await actionCells.allTextContents()
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.every(t => t === 'warn')).toBe(true)
  })

  test('filter pill All resets to show both actions', async ({ page }) => {
    await mockAuditLog(page)
    await page.goto('/audit-log')

    await page.getByRole('button', { name: 'Blocked' }).click()
    await page.getByRole('button', { name: 'All' }).click()

    // Use semantic data-testid selector instead of fragile positional td:nth-child(4)
    const actionCells = page.locator(ACTION_BADGE)
    await expect(actionCells.first()).toBeVisible()
    const texts = await actionCells.allTextContents()
    expect(texts).toContain('block')
    expect(texts).toContain('warn')
  })

  test('Load more button fetches the next page', async ({ page }) => {
    // Force limit=5 so the 15 mock events span multiple pages
    await mockAuditLog(page, 5)
    await page.goto('/audit-log')

    await expect(page.getByRole('button', { name: 'Load more' })).toBeVisible()
    // Wait for the first page to fully render before counting rows
    await expect(page.locator('tbody tr')).toHaveCount(5, { timeout: 5_000 })
    const rowsBefore = await page.locator('tbody tr').count()

    await page.getByRole('button', { name: 'Load more' }).click()

    await expect(page.locator('tbody tr')).toHaveCount(rowsBefore + 5, { timeout: 5_000 })
  })
})
