import { expect, test } from '@playwright/test'

import { deleteAllMail, extractLoginTokenFromMail, waitForMailFor } from './helpers/maildev'
import { runSeedDemo, runSeedReset } from './helpers/stack'

const ALICE = 'alice@example.com'
const ADMIN = 'admin@example.com'
const UNKNOWN = 'noone@example.com'

test.beforeAll(async () => {
  runSeedReset()
  runSeedDemo()
})

test.beforeEach(async () => {
  await deleteAllMail()
})

test.describe('full-stack auth', () => {
  test('seeded user can log in via email magic link', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email-address-icon').fill(ALICE)
    await page.getByRole('button', { name: 'Einloggen' }).click()
    await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })

    const mail = await waitForMailFor(ALICE)
    const token = extractLoginTokenFromMail(mail)

    await page.goto(`/login/${token}`)
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })
  })

  test('login request for unknown email does not error and sends no mail', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email-address-icon').fill(UNKNOWN)
    await page.getByRole('button', { name: 'Einloggen' }).click()
    await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })

    await new Promise((r) => setTimeout(r, 1000))
    const response = await fetch(`${process.env.MAILDEV_URL ?? 'http://localhost:1080'}/email`)
    const messages = (await response.json()) as { to: { address: string }[] }[]
    const matching = messages.filter((m) =>
      m.to.some((t) => t.address.toLowerCase() === UNKNOWN.toLowerCase()),
    )
    expect(matching).toHaveLength(0)
  })

  test('reusing a consumed token fails with 401', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email-address-icon').fill(ALICE)
    await page.getByRole('button', { name: 'Einloggen' }).click()
    const mail = await waitForMailFor(ALICE)
    const token = extractLoginTokenFromMail(mail)

    // First redemption succeeds
    await page.goto(`/login/${token}`)
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })

    // Re-using same token (in a fresh context simulated via context.clearCookies)
    await page.context().clearCookies()
    await page.goto(`/login/${token}`)
    await expect(page.getByText('Ein Fehler...')).toBeVisible({ timeout: 10_000 })
  })

  test('admin user reaches /admin page after login', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email-address-icon').fill(ADMIN)
    await page.getByRole('button', { name: 'Einloggen' }).click()
    const mail = await waitForMailFor(ADMIN)
    const token = extractLoginTokenFromMail(mail)

    await page.goto(`/login/${token}`)
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })

    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin/, { timeout: 5_000 })
  })

  test('rate limit silently blocks second login request within 60s', async ({ page }) => {
    // first request — should send mail
    await page.goto('/login')
    await page.locator('#email-address-icon').fill(ALICE)
    await page.getByRole('button', { name: 'Einloggen' }).click()
    await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })

    await waitForMailFor(ALICE)
    await deleteAllMail()

    // immediate second request — UI shows success but no mail is sent
    await page.goto('/login')
    await page.locator('#email-address-icon').fill(ALICE)
    await page.getByRole('button', { name: 'Einloggen' }).click()
    await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })

    await new Promise((r) => setTimeout(r, 1000))
    const response = await fetch(`${process.env.MAILDEV_URL ?? 'http://localhost:1080'}/email`)
    const messages = (await response.json()) as { to: { address: string }[] }[]
    const matching = messages.filter((m) =>
      m.to.some((t) => t.address.toLowerCase() === ALICE.toLowerCase()),
    )
    expect(matching).toHaveLength(0)
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
    const secret = process.env.SYNC_SECRET ?? 'test-sync-secret'
    const response = await request.post('/api/admin/sync-now', {
      headers: { Authorization: `Bearer ${secret}` },
    })
    expect(response.status()).toBe(200)
    const body = (await response.json()) as { added: number; deleted: number }
    expect(body).toHaveProperty('added')
    expect(body).toHaveProperty('deleted')
  })
})
