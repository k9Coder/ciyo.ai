import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

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
    await page.goto('/destinations')

    await page.getByRole('button', { name: /new group|add group|\+/i }).click()

    await page.getByLabel(/name/i).fill('E2E External Email')
    await page.getByLabel(/domains/i).fill('gmail.com, yahoo.com')
    await page.getByRole('button', { name: /create|save/i }).click()

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

    await page.goto('/destinations')
    await page.getByText('E2E Edit Group').waitFor()

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
