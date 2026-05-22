import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Members', () => {
  let createdMemberId: string | undefined

  test.afterEach(async () => {
    if (!createdMemberId) return
    const api = await playwrightRequest.newContext()
    await api.delete(`${BACKEND}/v1/members/${createdMemberId}`, { headers: adminHeaders() })
    await api.dispose()
    createdMemberId = undefined
  })

  test('can invite a member', async ({ page }) => {
    await page.goto('/members')

    await page.getByRole('button', { name: /invite|add member/i }).click()

    await page.getByLabel(/email/i).fill('e2e-invited@example.com')
    await page.getByLabel(/display name/i).fill('E2E Invited User')
    await page.getByRole('button', { name: /invite|send|save/i }).click()

    await expect(page.getByText('e2e-invited@example.com')).toBeVisible({ timeout: 5_000 })

    // Capture created ID for cleanup
    const api  = await playwrightRequest.newContext()
    const res   = await api.get(`${BACKEND}/v1/members`, { headers: adminHeaders() })
    const body  = await res.json() as Array<{ id: string; email: string }>
    createdMemberId = body.find(m => m.email === 'e2e-invited@example.com')?.id
    await api.dispose()
  })

  test('invite with empty email is blocked', async ({ page }) => {
    await page.goto('/members')
    await page.getByRole('button', { name: /invite|add member/i }).click()

    // Leave email empty, submit
    await page.getByRole('button', { name: /invite|send|save/i }).click()

    // Form stays visible — no member created
    await expect(page.getByLabel(/email/i)).toBeVisible()
  })
})
