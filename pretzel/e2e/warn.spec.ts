import { test, expect, chromium } from '@playwright/test'
import path from 'path'

const FIXTURES = 'http://localhost:9876'
const EXT_PATH = path.resolve(__dirname, '../dist')

// Minimal policyDoc injected directly into storage — no backend sync required.
// Mirrors what seed-e2e.ts seeds: one subject with ACME_SECRET (block) + ACME_WARN (warn).
const TEST_POLICY_DOC = {
  version:     1,
  tenantId:    'e2etenant',
  subjects: [
    {
      id:   'acme-confidential',
      name: 'ACME Confidential',
      rules: [
        {
          id:          'acme-secret-block',
          kind:        'keyword',
          keywords:    ['ACME_SECRET'],
          pattern:     null,
          destinations: [],
          action:      'block',
          message:     null,
          reportLevel: 'medium',
        },
        {
          id:          'acme-warn-rule',
          kind:        'keyword',
          keywords:    ['ACME_WARN'],
          pattern:     null,
          destinations: [],
          action:      'warn',
          message:     null,
          reportLevel: 'medium',
        },
      ],
    },
  ],
  siteConfigs: {},
}

async function launchWithPolicy() {
  const extPath  = EXT_PATH
  const context  = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
    ],
  })

  // Inject token + policyDoc directly so the extension enforces the seeded rules
  // without needing to sync from the backend.
  const background = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker')
  await background.evaluate((doc) => {
    void chrome.storage.local.set({ orgToken: 'e2e-fake-token', policyDoc: doc })
  }, TEST_POLICY_DOC)

  return context
}

test.describe('Warn vs block modal behaviour (seeded policy)', () => {
  test("ACME_WARN rule shows 'It's fine, send it' button", async () => {
    const context = await launchWithPolicy()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/chatgpt-mock.html`)

    await page.locator('#prompt-textarea').fill('Please review ACME_WARN data')
    await page.locator('#send-button').click()

    const modal = page.locator('#mykka-overlay-host').locator('#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

    // Warn action — "It's fine, send it" must be present
    await expect(modal.getByRole('button', { name: "It's fine, send it" })).toBeVisible()

    await context.close()
  })

  test("ACME_SECRET block rule does NOT show 'It's fine, send it'", async () => {
    const context = await launchWithPolicy()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/chatgpt-mock.html`)

    await page.locator('#prompt-textarea').fill('This contains ACME_SECRET credentials')
    await page.locator('#send-button').click()

    const modal = page.locator('#mykka-overlay-host').locator('#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

    // Block action — "It's fine, send it" must NOT appear
    await expect(modal.getByRole('button', { name: "It's fine, send it" })).not.toBeVisible()
    await expect(modal.getByText('Your policy does not allow sending this content.')).toBeVisible()

    await context.close()
  })
  test("block modal 'Remove details & send' sends the prompt without the secret, then shows a toast", async () => {
    const context = await launchWithPolicy()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/chatgpt-mock.html`)
    await page.locator('html[data-mykka-ready]').waitFor({ timeout: 5_000 })

    await page.locator('#prompt-textarea').fill('Please use ACME_SECRET in the summary')
    await page.locator('#send-button').click()

    const host  = page.locator('#mykka-overlay-host')
    const modal = host.locator('#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })
    // Reporting is on (reportLevel "medium"), so the footnote says what IT sees.
    await expect(modal.getByText('the rule and the site, not the prompt')).toBeVisible()

    await modal.getByRole('button', { name: 'Remove details & send' }).click()

    await expect(page.locator('#output')).toContainText('SENT: Please use [removed] in the summary', { timeout: 5_000 })
    await expect(page.locator('#output')).not.toContainText('ACME_SECRET')

    const toast = host.locator('#ps-toast-root')
    await expect(toast.getByText('1 detail removed')).toBeVisible()
    await toast.getByRole('button', { name: 'Show' }).click()
    await expect(toast.getByText('ACME Confidential', { exact: false }).or(toast.getByRole('listitem'))).toBeVisible()

    await context.close()
  })

  test("warn modal does not offer 'Remove details & send'", async () => {
    const context = await launchWithPolicy()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/chatgpt-mock.html`)

    await page.locator('#prompt-textarea').fill('Please review ACME_WARN data')
    await page.locator('#send-button').click()

    const modal = page.locator('#mykka-overlay-host').locator('#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })
    await expect(modal.getByRole('button', { name: 'Remove details & send' })).toHaveCount(0)

    await context.close()
  })

  test("status chip shows 'Pretzel on', and 'Pretzel paused' when the site is paused", async () => {
    const context = await launchWithPolicy()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/chatgpt-mock.html`)
    await page.locator('html[data-mykka-ready]').waitFor({ timeout: 5_000 })

    const chip = page.locator('#mykka-overlay-host').locator('#ps-chip-root')
    await expect(chip.getByText('Pretzel on')).toBeVisible({ timeout: 5_000 })

    const background = context.serviceWorkers()[0]
    await background.evaluate(() => chrome.storage.local.set({ promptshield_site_overrides: ['localhost'] }))
    await expect(chip.getByText('Pretzel paused')).toBeVisible({ timeout: 5_000 })

    await context.close()
  })
})
