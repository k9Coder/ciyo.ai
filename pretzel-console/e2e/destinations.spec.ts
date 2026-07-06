import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from './helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Destination groups', () => {
  let createdGroupId: string | undefined

  test.afterEach(async () => {
    if (!createdGroupId) return
    const api = await playwrightRequest.newContext()
    await api.delete(`${BACKEND}/v1/destination-groups/${createdGroupId}`, { headers: adminHeaders() })
    await api.dispose()
    createdGroupId = undefined
  })

  test('can create a destination group', async ({ page }) => {
    // Wait for the list GET to succeed before acting so the Clerk JWT is warm
    // by the time we click Save. Set up the listener before navigation so we
    // don't miss the response.
    const listReady = page.waitForResponse(
      res => res.url().includes('/v1/destination-groups') && res.request().method() === 'GET' && res.status() === 200,
      { timeout: 20_000 },
    )
    await page.goto('/destinations')
    await listReady

    await page.getByRole('button', { name: /new group|add group|\+/i }).first().click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/name/i).fill('E2E External Email')
    await dialog.getByLabel(/domains/i).fill('gmail.com\nyahoo.com')
    await dialog.getByRole('button', { name: /save/i }).click()

    await expect(dialog).not.toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('E2E External Email')).toBeVisible()

    const api  = await playwrightRequest.newContext()
    const res   = await api.get(`${BACKEND}/v1/destination-groups`, { headers: adminHeaders() })
    const body  = await res.json() as Array<{ id: string; name: string }>
    createdGroupId = body.find(g => g.name === 'E2E External Email')?.id
    await api.dispose()
  })

  test('can rename a destination group', async ({ page }) => {
    // Create a group, rename it, clean up — all within this test
    const api = await playwrightRequest.newContext()
    const createRes = await api.post(`${BACKEND}/v1/destination-groups`, {
      headers: adminHeaders(),
      data: { name: 'E2E Edit Group', domains: ['edit-test.com'] },
    })
    const group = await createRes.json() as { id: string }
    await api.dispose()

    const listReady = page.waitForResponse(
      res => res.url().includes('/v1/destination-groups') && res.request().method() === 'GET' && res.status() === 200,
      { timeout: 20_000 },
    )
    await page.goto('/destinations')
    await listReady
    await page.getByText('E2E Edit Group').waitFor({ timeout: 5_000 })

    // Edit button is a plain <button> in each group card
    await page.getByRole('button', { name: 'Edit' }).first().click()

    await page.getByRole('dialog').getByLabel('Name').clear()
    await page.getByRole('dialog').getByLabel('Name').fill('E2E Edit Group Renamed')
    await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()

    await expect(page.getByText('E2E Edit Group Renamed')).toBeVisible()

    // Cleanup
    const cleanupApi = await playwrightRequest.newContext()
    await cleanupApi.delete(`${BACKEND}/v1/destination-groups/${group.id}`, { headers: adminHeaders() })
    await cleanupApi.dispose()
  })
})
