import { test, expect } from '@playwright/test'

// Semantic selector for the action column badge.
// The audit table renders each action as a <span data-testid="event-action"> inside
// the action cell. Using this instead of `td:nth-child(4) span` means the selector
// is immune to column reordering or insertion.
const ACTION_BADGE = '[data-testid="event-action"]'

test.describe('Audit Log', () => {
  test('page loads and renders event rows', async ({ page }) => {
    await page.goto('/audit')

    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBeGreaterThan(1)
  })

  test('filter pill Blocked shows only block events', async ({ page }) => {
    await page.goto('/audit')

    await page.getByRole('button', { name: 'Blocked' }).click()

    // Use semantic data-testid selector instead of fragile positional td:nth-child(4)
    const actionCells = page.locator(ACTION_BADGE)
    await expect(actionCells.first()).toBeVisible()
    const texts = await actionCells.allTextContents()
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.every(t => t === 'block')).toBe(true)
  })

  test('filter pill Warned shows only warn events', async ({ page }) => {
    await page.goto('/audit')

    await page.getByRole('button', { name: 'Warned' }).click()

    // Use semantic data-testid selector instead of fragile positional td:nth-child(4)
    const actionCells = page.locator(ACTION_BADGE)
    await expect(actionCells.first()).toBeVisible()
    const texts = await actionCells.allTextContents()
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.every(t => t === 'warn')).toBe(true)
  })

  test('filter pill All resets to show both actions', async ({ page }) => {
    await page.goto('/audit')

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
    // Force limit=5 so the 15 seeded events span multiple pages
    await page.route('**/v1/audit-log**', async route => {
      const url = new URL(route.request().url())
      url.searchParams.set('limit', '5')
      await route.continue({ url: url.toString() })
    })

    await page.goto('/audit')

    await expect(page.getByRole('button', { name: 'Load more' })).toBeVisible()
    // Wait for the first page to fully render before counting rows
    await expect(page.locator('tbody tr')).toHaveCount(5, { timeout: 5_000 })
    const rowsBefore = await page.locator('tbody tr').count()

    await page.getByRole('button', { name: 'Load more' }).click()

    await expect(page.locator('tbody tr')).toHaveCount(rowsBefore + 5, { timeout: 5_000 })
  })
})
