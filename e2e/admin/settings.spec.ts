import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Settings', () => {
  test('page loads and shows tenant name', async ({ page }) => {
    await page.goto('/settings')

    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
    await expect(page.getByText('E2E Test Org')).toBeVisible()
    await expect(page.getByText('Organisation')).toBeVisible()
    await expect(page.getByText('API Tokens')).toBeVisible()
  })

  test('can edit the organisation name', async ({ page }) => {
    await page.goto('/settings')

    await page.getByRole('button', { name: 'Edit' }).click()

    // The edit form renders a single text input with autoFocus
    const nameInput = page.locator('input').first()
    await nameInput.clear()
    await nameInput.fill('E2E Test Org Renamed')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('E2E Test Org Renamed')).toBeVisible()

    // Restore the original name via API
    const api = await playwrightRequest.newContext()
    await api.patch(`${BACKEND}/v1/tenant`, {
      headers: adminHeaders(),
      data: { name: 'E2E Test Org' },
    })
    await api.dispose()
  })

  test('rotate org token button triggers a confirm dialog', async ({ page }) => {
    await page.goto('/settings')

    let dialogMessage = ''
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message()
      await dialog.dismiss() // Cancel — do NOT actually rotate
    })

    // The page has two "Rotate" buttons (org token, admin token) — click the first
    await page.getByRole('button', { name: 'Rotate' }).first().click()

    expect(dialogMessage).toMatch(/rotate|org token/i)
  })

  test('rotate admin token button triggers a confirm dialog', async ({ page }) => {
    await page.goto('/settings')

    let dialogMessage = ''
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message()
      await dialog.dismiss()
    })

    await page.getByRole('button', { name: 'Rotate' }).nth(1).click()

    expect(dialogMessage).toMatch(/rotate|admin token/i)
  })
})
