import { expect, test } from '@playwright/test'

import {
  deleteAllMail,
  extractLoginTokenFromMail,
  preparePage,
  waitForMailFor,
} from './helpers/maildev'
import { runSeedDemo, runSeedReset } from './helpers/stack'

import type { Page } from '@playwright/test'

// A seeded user we edit. The beforeAll reset restores the demo name, so the
// edits below don't leak between runs.
const ALICE = 'alice@example.com'

test.beforeAll(() => {
  runSeedReset()
  runSeedDemo()
})

test.beforeEach(async () => {
  await deleteAllMail()
})

async function loginViaMagicLink(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await preparePage(page)
  await page.locator('#email-address-icon').fill(email)
  await page.getByRole('button', { name: 'Einloggen' }).click()
  await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })
  const mail = await waitForMailFor(email)
  const token = extractLoginTokenFromMail(mail)
  await page.goto(`/login/${token}`)
  await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })
}

test.describe('full-stack profile', () => {
  test('a user can edit their name in settings and it persists', async ({ page }) => {
    await loginViaMagicLink(page, ALICE)

    await page.goto('/settings')
    await preparePage(page)
    // The form is pre-filled from DAV (source of truth).
    await expect(page.locator('#settings-firstName')).toHaveValue(/.+/, { timeout: 10_000 })

    await page.locator('#settings-firstName').fill('Alicia')
    await page.locator('#settings-lastName').fill('Wonder')
    await page.getByRole('button', { name: 'Speichern' }).click()
    await expect(page.getByText('Gespeichert.')).toBeVisible({ timeout: 10_000 })

    // The header greeting reflects the new (last) name without a re-login.
    await expect(page.getByText('Wonder').first()).toBeVisible({ timeout: 10_000 })

    // Persisted: a fresh load reads the new name back from DAV.
    await page.reload()
    await preparePage(page)
    await expect(page.locator('#settings-firstName')).toHaveValue('Alicia', { timeout: 10_000 })
    await expect(page.locator('#settings-lastName')).toHaveValue('Wonder')
  })

  test('the name endpoint rejects an empty first name', async ({ page }) => {
    await loginViaMagicLink(page, ALICE)
    const res = await page.context().request.post('/api/me/profile', {
      data: { firstName: '', lastName: 'Wonder' },
    })
    expect(res.status()).toBe(400)
  })

  test('the name endpoints require authentication', async ({ request }) => {
    expect((await request.get('/api/me/profile')).status()).toBe(401)
    expect(
      (await request.post('/api/me/profile', { data: { firstName: 'A', lastName: 'B' } })).status(),
    ).toBe(401)
  })
})
