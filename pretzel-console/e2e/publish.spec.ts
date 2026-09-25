import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from './helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

// Publishing is driven by unpublished changes ("draft"): with none, the page has no
// publish button. Creating a subject through the API is the cheapest way to make one.
async function createDraftSubject(name: string): Promise<string> {
  const api = await playwrightRequest.newContext()
  const res = await api.post(`${BACKEND}/v1/subjects`, { headers: adminHeaders(), data: { name } })
  expect(res.ok()).toBeTruthy()
  const { id } = await res.json() as { id: string }
  await api.dispose()
  return id
}

async function deleteSubject(id: string): Promise<void> {
  const api = await playwrightRequest.newContext()
  await api.delete(`${BACKEND}/v1/subjects/${id}`, { headers: adminHeaders() })
  await api.dispose()
}

test.describe('Publish', () => {
  test('unpublished changes are listed, then cleared by publishing', async ({ page }) => {
    const name = `E2E Draft ${Date.now()}`
    const id = await createDraftSubject(name)
    try {
      await page.goto('/publish')
      // Shown both in the sidebar card and on the Publish page.
      await expect(page.getByRole('complementary').getByText(/changes? not live/i)).toBeVisible()
      await expect(page.getByRole('main').getByText(/changes? not live/i)).toBeVisible()
      await expect(page.getByText(name)).toBeVisible()

      const publishDone = page.waitForResponse(r => r.url().includes('/v1/policy/publish'))
      await page.getByRole('button', { name: /^publish v\d+/i }).click()
      await publishDone

      await expect(page.getByText(name)).toHaveCount(0)
    } finally {
      await deleteSubject(id)
    }
  })

  test('publish succeeds and version increments', async ({ page }) => {
    const id = await createDraftSubject(`E2E Version ${Date.now()}`)
    await page.goto('/publish')

    // Read current version label before publishing
    const versionText    = await page.getByText(/version/i).first().textContent()
    const currentVersion = parseInt(versionText?.match(/\d+/)?.[0] ?? '0', 10)

    const publishDone = page.waitForResponse(r => r.url().includes('/v1/policy/publish'))
    await page.getByRole('button', { name: /publish/i }).click()
    await publishDone

    // Wait for the UI to reflect the new version
    await expect(async () => {
      const updatedText = await page.getByText(/version/i).first().textContent() ?? ''
      const newVersion  = parseInt(updatedText.match(/\d+/)?.[0] ?? '0', 10)
      expect(newVersion).toBeGreaterThan(currentVersion)
    }).toPass({ timeout: 10_000 })
    await deleteSubject(id)
  })

  test('policy history table shows published versions', async ({ page }) => {
    await page.goto('/publish')

    // The seeded tenant always has v1 in history
    await expect(page.getByText('Published versions')).toBeVisible()
    await expect(page.getByText(/v\d+/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rollback to this' }).first()).toBeVisible()
  })

  test('rollback to a previous version increments the version number', async ({ page }) => {
    // Ensure there are at least 2 versions: publish once via API to create v2 (seed has v1)
    const api = await playwrightRequest.newContext()
    await api.post(`${BACKEND}/v1/policy/publish`, { headers: adminHeaders() })
    await api.dispose()

    await page.goto('/publish')

    // Read current version before rollback
    const versionText    = await page.getByText(/version \d+/i).first().textContent()
    const currentVersion = parseInt(versionText?.match(/\d+/)?.[0] ?? '0', 10)

    // Rollback to the earliest version shown (last row)
    await page.getByRole('button', { name: 'Rollback to this' }).last().click()
    // ConfirmModal appears — wait for the rollback API response
    const rollbackDone = page.waitForResponse(
      r => r.url().includes('/v1/policy/rollback') && r.request().method() === 'POST'
    )
    await page.getByRole('button', { name: 'Delete' }).click()
    await rollbackDone

    // Wait for the UI to update (invalidateQueries triggers a background refetch)
    await expect(async () => {
      const updatedText = await page.getByText(/version \d+/i).first().textContent() ?? ''
      const newVersion  = parseInt(updatedText.match(/\d+/)?.[0] ?? '0', 10)
      expect(newVersion).toBeGreaterThan(currentVersion)
    }).toPass({ timeout: 10_000 })
  })
})
