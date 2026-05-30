import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Subjects', () => {
  let createdSubjectId: string | undefined

  test.afterEach(async () => {
    if (!createdSubjectId) return
    const api = await playwrightRequest.newContext()
    await api.delete(`${BACKEND}/v1/subjects/${createdSubjectId}`, { headers: adminHeaders() })
    await api.dispose()
    createdSubjectId = undefined
  })

  test('can create a subject', async ({ page }) => {
    await page.goto('/subjects')

    await page.getByRole('button', { name: /new subject|add subject|\+/i }).click()

    await page.getByLabel(/name/i).fill('E2E Test Subject')
    await page.getByRole('button', { name: /create|save/i }).click()

    // Subject appears in the list
    await expect(page.getByText('E2E Test Subject')).toBeVisible()

    // Capture the ID for cleanup
    const api  = await playwrightRequest.newContext()
    const res   = await api.get(`${BACKEND}/v1/subjects`, { headers: adminHeaders() })
    const body  = await res.json() as Array<{ id: string; name: string }>
    createdSubjectId = body.find(s => s.name === 'E2E Test Subject')?.id
    await api.dispose()
  })

  test('empty subject name is blocked by form validation', async ({ page }) => {
    await page.goto('/subjects')
    await page.getByRole('button', { name: /new subject|add subject|\+/i }).click()

    // Leave name empty, attempt to save
    await page.getByRole('button', { name: /create|save/i }).click()

    // Modal stays open — no new subject created
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('can add a keyword block rule to a subject', async ({ page }) => {
    await page.goto('/subjects')

    // Select the seeded subject
    await page.getByText('ACME Confidential').click()

    await page.getByRole('button', { name: /add rule|\+/i }).click()

    await page.getByLabel(/keywords/i).fill('TEST_KEYWORD_E2E')
    await page.getByRole('combobox', { name: /action/i }).selectOption('block')
    await page.getByRole('button', { name: /create|save/i }).click()

    await expect(page.getByText('TEST_KEYWORD_E2E')).toBeVisible()

    // Cleanup the rule via API
    const api    = await playwrightRequest.newContext()
    const subRes = await api.get(`${BACKEND}/v1/subjects`, { headers: adminHeaders() })
    const subs   = await subRes.json() as Array<{ id: string; name: string }>
    const subId  = subs.find(s => s.name === 'ACME Confidential')!.id
    const ruleRes = await api.get(`${BACKEND}/v1/subjects/${subId}/rules`, { headers: adminHeaders() })
    const rules   = await ruleRes.json() as Array<{ id: string; keywords: string[] }>
    const created = rules.find(r => r.keywords?.includes('TEST_KEYWORD_E2E'))
    if (created) await api.delete(`${BACKEND}/v1/rules/${created.id}`, { headers: adminHeaders() })
    await api.dispose()
  })

  test('can rename a subject', async ({ page }) => {
    await page.goto('/subjects')

    const subjectRow = page.locator('button', { hasText: 'ACME Confidential' })
    await subjectRow.locator('span', { hasText: 'Edit' }).click()

    await page.getByRole('dialog').getByLabel('Name').clear()
    await page.getByRole('dialog').getByLabel('Name').fill('ACME Confidential Renamed')
    await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()

    await expect(page.getByText('ACME Confidential Renamed')).toBeVisible()

    // Restore original name so downstream tests still find it
    const api = await playwrightRequest.newContext()
    const subRes = await api.get(`${BACKEND}/v1/subjects`, { headers: adminHeaders() })
    const subs = await subRes.json() as Array<{ id: string; name: string }>
    const sub = subs.find(s => s.name === 'ACME Confidential Renamed')
    if (sub) {
      await api.patch(`${BACKEND}/v1/subjects/${sub.id}`, {
        headers: adminHeaders(),
        data: { name: 'ACME Confidential' },
      })
    }
    await api.dispose()
  })

  test('can edit a rule action', async ({ page }) => {
    // Create a throwaway rule so we never modify the seeded ACME rules permanently
    const api = await playwrightRequest.newContext()
    const subRes = await api.get(`${BACKEND}/v1/subjects`, { headers: adminHeaders() })
    const subs = await subRes.json() as Array<{ id: string; name: string }>
    const subId = subs.find(s => s.name === 'ACME Confidential')!.id

    const ruleRes = await api.post(`${BACKEND}/v1/subjects/${subId}/rules`, {
      headers: adminHeaders(),
      data: { kind: 'keyword', action: 'warn', keywords: ['EDIT_RULE_E2E'], reportLevel: 'none' },
    })
    const rule = await ruleRes.json() as { id: string }
    await api.dispose()

    await page.goto('/subjects')
    await page.locator('button', { hasText: 'ACME Confidential' }).click()

    // Walk up 2 levels from the keyword span to the card div, then click Edit
    const keywordSpan = page.locator('span').filter({ hasText: /^EDIT_RULE_E2E$/ })
    await keywordSpan.locator('../..').getByRole('button', { name: 'Edit' }).click()

    // Change action to block
    await page.getByRole('dialog').getByRole('combobox', { name: /action/i }).selectOption('block')
    await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()

    // Badge in the rule card updates to "block"
    const updatedCard = page.locator('span').filter({ hasText: /^EDIT_RULE_E2E$/ }).locator('../..')
    await expect(updatedCard.getByText('block')).toBeVisible()

    // Cleanup
    const cleanupApi = await playwrightRequest.newContext()
    await cleanupApi.delete(`${BACKEND}/v1/rules/${rule.id}`, { headers: adminHeaders() })
    await cleanupApi.dispose()
  })
})
