import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from './helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Members', () => {
  // Token invite links are retired: an admin pre-adds an email, and the person joins by signing up with it
  // (see signup-flows.spec.ts for that half). This is the admin's half.
  test('admin can add a member by email and remove them again', async ({ page }) => {
    const email = `e2e-added-${Date.now()}@example.com`
    await page.goto('/members')

    await page.getByRole('button', { name: /add member/i }).click()
    await page.locator('form').getByPlaceholder('alice@lawfirm.com').fill(email)
    await page.locator('form').getByRole('button', { name: /^add member$/i }).click()

    const row = page.locator('tr', { hasText: email })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByText('Member', { exact: true })).toBeVisible()

    await row.getByRole('button', { name: /remove/i }).click()
    await page.getByRole('button', { name: /^delete$/i }).click()
    await expect(row).toHaveCount(0)
  })

  test('emails are stored lowercase, so the letter case an admin types never blocks sign-up', async () => {
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/members`, {
      headers: adminHeaders(),
      data: { email: `E2E-Mixed-${Date.now()}@Example.COM`, role: 'member' },
    })
    const member = await res.json() as { id: string; email: string }
    expect(member.email).toBe(member.email.toLowerCase())
    await api.delete(`${BACKEND}/v1/members/${member.id}`, { headers: adminHeaders() })
    await api.dispose()
  })

  test('can change a member role', async ({ page }) => {
    // Create a throwaway member so we never modify the seeded super_admin
    const api = await playwrightRequest.newContext()
    const createRes = await api.post(`${BACKEND}/v1/members`, {
      headers: adminHeaders(),
      data: { email: 'e2e-role-edit@example.com', role: 'member' },
    })
    const member = await createRes.json() as { id: string }
    await api.dispose()

    await page.goto('/members')

    const memberRow = page.locator('tr', { hasText: 'e2e-role-edit@example.com' })
    await memberRow.getByRole('button', { name: 'Edit role' }).click()

    await memberRow.getByRole('combobox', { name: 'Role' }).selectOption('division_admin')
    // A division_admin must be assigned a division in the same edit — the
    // picker only renders once that role is selected.
    await memberRow.getByRole('combobox', { name: 'Division' }).selectOption({ label: 'E2E Division' })
    await memberRow.getByRole('button', { name: 'Save' }).click()

    await expect(memberRow.getByText('Division Admin')).toBeVisible()
    await expect(memberRow.getByText('E2E Division')).toBeVisible()

    // Cleanup
    const cleanupApi = await playwrightRequest.newContext()
    await cleanupApi.delete(`${BACKEND}/v1/members/${member.id}`, { headers: adminHeaders() })
    await cleanupApi.dispose()
  })
})
