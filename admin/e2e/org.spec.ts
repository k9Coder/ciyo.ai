import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from './helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Org — divisions and teams', () => {
  test('page loads and shows seeded division', async ({ page }) => {
    await page.goto('/org')

    await expect(page.getByRole('heading', { name: /org/i })).toBeVisible()
    await expect(page.getByText('E2E Division')).toBeVisible()
  })

  test('can create and delete a division', async ({ page }) => {
    await page.goto('/org')

    await page.getByRole('button', { name: /new division|add division/i }).click()
    await page.getByLabel('Name').fill('E2E Temp Division')
    await page.getByRole('button', { name: /create|save/i }).click()

    await expect(page.getByText('E2E Temp Division')).toBeVisible()

    // Cleanup via API
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/divisions`, { headers: adminHeaders() })
    const divs = await res.json() as Array<{ id: string; name: string }>
    const div  = divs.find(d => d.name === 'E2E Temp Division')
    if (div) await api.delete(`${BACKEND}/v1/divisions/${div.id}`, { headers: adminHeaders() })
    await api.dispose()
  })

  test('can create a team inside a division', async ({ page }) => {
    await page.goto('/org')

    // Select the seeded division to reveal its teams column
    await page.getByText('E2E Division').click()

    await page.getByRole('button', { name: /new team|add team/i }).click()
    await page.getByLabel('Name').fill('E2E Temp Team')
    await page.getByRole('button', { name: /create|save/i }).click()

    await expect(page.getByText('E2E Temp Team')).toBeVisible()

    // Cleanup via API
    const api = await playwrightRequest.newContext()
    const divRes = await api.get(`${BACKEND}/v1/divisions`, { headers: adminHeaders() })
    const divs   = await divRes.json() as Array<{ id: string; name: string }>
    const div    = divs.find(d => d.name === 'E2E Division')!

    const teamRes = await api.get(`${BACKEND}/v1/divisions/${div.id}/teams`, { headers: adminHeaders() })
    const teams   = await teamRes.json() as Array<{ id: string; name: string }>
    const team    = teams.find(t => t.name === 'E2E Temp Team')
    if (team) await api.delete(`${BACKEND}/v1/teams/${team.id}`, { headers: adminHeaders() })
    await api.dispose()
  })

  test('selecting a division and team shows member column', async ({ page }) => {
    await page.goto('/org')

    await page.getByText('E2E Division').click()
    await expect(page.getByText('E2E Team')).toBeVisible()

    await page.getByText('E2E Team').click()

    // After selecting the team, the third column (members) should appear
    await expect(page.getByText(/member|no member/i).first()).toBeVisible()
  })
})
