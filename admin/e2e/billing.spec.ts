import { test, expect } from '@playwright/test'

const FREE_BILLING = {
  plan:               'free',
  subscriptionStatus: 'active',
  trialEndsAt:        null,
  seatCount:          3,
  seatLimit:          3,
  monthlyScans:       500,
  scanLimit:          500,
  scanBlocked:        true,
  paymentProvider:    null,
  features:           { assistantEnabled: false, advancedAnalytics: false },
}

const BUSINESS_BILLING = {
  plan:               'business',
  subscriptionStatus: 'active',
  trialEndsAt:        null,
  seatCount:          10,
  seatLimit:          -1,
  monthlyScans:       1234,
  scanLimit:          -1,
  scanBlocked:        false,
  paymentProvider:    'stripe',
  features:           { assistantEnabled: true, advancedAnalytics: true },
}

test.describe('Billing UI — Settings page', () => {
  test('shows Billing section with business plan info', async ({ page }) => {
    await page.route('**/v1/billing/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BUSINESS_BILLING) })
    )

    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /billing/i })).toBeVisible()
    // "business" text in the settings billing section (not the sidebar PlanBadge)
    await expect(page.locator('text=business').nth(1)).toBeVisible()
    await expect(page.getByText(/manage subscription/i)).toBeVisible()
  })

  test('shows scan progress bar on free plan at limit', async ({ page }) => {
    await page.route('**/v1/billing/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FREE_BILLING) })
    )

    await page.goto('/settings')
    await expect(page.getByText('500 / 500', { exact: true })).toBeVisible()
    await expect(page.getByText(/upgrade plan/i).first()).toBeVisible()
  })
})

test.describe('Billing UI — Sidebar UpgradeBanner', () => {
  test('shows upgrade banner when near scan limit (80%+)', async ({ page }) => {
    await page.route('**/v1/billing/status', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...FREE_BILLING,
          monthlyScans: 420,
          scanLimit:    500,
          scanBlocked:  false,
        }),
      })
    )

    await page.goto('/settings')
    await expect(page.getByText(/approaching scan limit/i)).toBeVisible()
  })

  test('shows scan limit reached in sidebar', async ({ page }) => {
    await page.route('**/v1/billing/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FREE_BILLING) })
    )

    await page.goto('/settings')
    await expect(page.getByText(/scan limit reached/i)).toBeVisible()
  })

  test('no upgrade banner for business plan', async ({ page }) => {
    await page.route('**/v1/billing/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BUSINESS_BILLING) })
    )

    await page.goto('/settings')
    await expect(page.getByText(/upgrade/i)).not.toBeVisible()
  })
})

test.describe('Billing UI — PlanGate on Assistant', () => {
  test('shows PlanGate upgrade prompt for free plan', async ({ page }) => {
    await page.route('**/v1/billing/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FREE_BILLING) })
    )

    await page.goto('/assistant')
    await expect(page.getByText(/business plan required/i)).toBeVisible()
    await expect(page.getByText(/view plans/i)).toBeVisible()
  })

  test('shows assistant UI for business plan', async ({ page }) => {
    await page.route('**/v1/billing/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BUSINESS_BILLING) })
    )
    // Mock assistant sessions and chat endpoints to avoid LLM calls
    await page.route('**/v1/assistant/sessions', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) })
    )

    await page.goto('/assistant')
    await expect(page.getByText(/business plan required/i)).not.toBeVisible()
    await expect(page.getByText(/describe a policy change/i)).toBeVisible()
  })
})
