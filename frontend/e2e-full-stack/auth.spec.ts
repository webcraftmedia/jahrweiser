import { expect, test } from '@playwright/test'

import {
  deleteAllMail,
  extractLoginTokenFromMail,
  preparePage,
  waitForMailFor,
} from './helpers/maildev'
import { runSeedDemo, runSeedReset } from './helpers/stack'

// Each test uses a different seeded user so the in-process rate limit on
// requestLoginLink (60s/user) doesn't leak between tests.
const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const ADMIN = 'admin@example.com'
const CAROL = 'carol@example.com'
const UNKNOWN = 'noone@example.com'

test.beforeAll(async () => {
  runSeedReset()
  runSeedDemo()
})

test.beforeEach(async () => {
  await deleteAllMail()
})

async function loginViaMagicLink(page: import('@playwright/test').Page, email: string) {
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

test.describe('full-stack auth', () => {
  test('seeded user can log in via email magic link', async ({ page }) => {
    await loginViaMagicLink(page, ALICE)
  })

  test('login request for unknown email does not error and sends no mail', async ({ page }) => {
    await page.goto('/login')
    await preparePage(page)
    await page.locator('#email-address-icon').fill(UNKNOWN)
    await page.getByRole('button', { name: 'Einloggen' }).click()
    await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })

    await page.waitForTimeout(1500)
    const response = await fetch(`${process.env.MAILDEV_URL ?? 'http://localhost:1080'}/email`)
    const messages = (await response.json()) as { to: { address: string }[] }[]
    const matching = messages.filter((m) =>
      m.to.some((t) => t.address.toLowerCase() === UNKNOWN.toLowerCase()),
    )
    expect(matching).toHaveLength(0)
  })

  test('reusing a consumed token fails with 401', async ({ page }) => {
    await page.goto('/login')
    await preparePage(page)
    await page.locator('#email-address-icon').fill(BOB)
    await page.getByRole('button', { name: 'Einloggen' }).click()
    await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })
    const mail = await waitForMailFor(BOB)
    const token = extractLoginTokenFromMail(mail)

    await page.goto(`/login/${token}`)
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })

    await page.context().clearCookies()
    await page.goto(`/login/${token}`)
    await expect(page.getByText('Ein Fehler...')).toBeVisible({ timeout: 10_000 })
  })

  test('admin user reaches /admin page after login', async ({ page }) => {
    await loginViaMagicLink(page, ADMIN)

    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin/, { timeout: 5_000 })
  })

  test('logged-in user can fetch calendars then logout invalidates session', async ({
    page,
    context,
  }) => {
    await loginViaMagicLink(page, CAROL)

    // Browser context now holds the session cookie. Use context.request to
    // call the calendars API with that cookie.
    const calendarsResp = await context.request.get('/api/calendars')
    expect(calendarsResp.status()).toBe(200)

    // Logout via nuxt-auth-utils' clear endpoint, then verify the session
    // really is gone — the same calendars call should now 401.
    await context.request.delete('/api/_auth/session')
    const after = await context.request.get('/api/calendars')
    expect([401, 403]).toContain(after.status())
  })
})

test.describe('sync-now endpoint', () => {
  test('rejects request without Authorization header', async ({ request }) => {
    const response = await request.post('/api/admin/sync-now')
    expect(response.status()).toBe(401)
  })

  test('rejects request with wrong Bearer token', async ({ request }) => {
    const response = await request.post('/api/admin/sync-now', {
      headers: { Authorization: 'Bearer wrong-secret' },
    })
    expect(response.status()).toBe(401)
  })

  test('returns sync result with correct Bearer token', async ({ request }) => {
    const secret = process.env.SYNC_SECRET ?? 'dev-sync-secret'
    const response = await request.post('/api/admin/sync-now', {
      headers: { Authorization: `Bearer ${secret}` },
    })
    expect(response.status()).toBe(200)
    const body = (await response.json()) as { added: number; deleted: number }
    expect(body).toHaveProperty('added')
    expect(body).toHaveProperty('deleted')
  })
})
