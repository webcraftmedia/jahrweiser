import { expect, test } from '@playwright/test'

import {
  createDavUser,
  deleteDavUser,
  getVCardUrlByEmail,
  mariadb,
  triggerSync,
  updateDavUser,
} from './helpers/dav'
import {
  deleteAllMail,
  extractLoginTokenFromMail,
  preparePage,
  waitForMailFor,
} from './helpers/maildev'
import { runSeedDemo, runSeedReset } from './helpers/stack'

// Each test creates its own user (with a deterministic UID) so the seeded
// dataset stays untouched and tests don't bleed into each other.
test.beforeAll(async () => {
  runSeedReset()
  runSeedDemo()
})

test.beforeEach(async () => {
  await deleteAllMail()
})

test.describe('soft-delete', () => {
  test('user removed from DAV is soft-deleted by sync and cannot login', async () => {
    const uid = 'edge-soft-delete-1'
    const email = 'soft-delete@example.com'
    await createDavUser({ uid, email, displayName: 'Will Be Deleted' })
    await triggerSync()
    expect(mariadb(`SELECT email FROM users WHERE email = '${email}'`)).toBe(email)

    // Now delete in DAV and re-sync — sidecar should soft-delete the user.
    await deleteDavUser(uid)
    const result = await triggerSync()
    expect(result.deleted).toBeGreaterThanOrEqual(1)

    const deletedAt = mariadb(`SELECT deleted_at FROM users WHERE email = '${email}'`)
    expect(deletedAt).not.toBe('NULL')
    expect(deletedAt).not.toBe('')

    // Login attempt no longer sends mail.
    const resp = await fetch('http://localhost:3000/api/requestLoginLink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    expect(resp.status).toBe(200)

    await new Promise((r) => setTimeout(r, 1000))
    const mail = await fetch('http://localhost:1080/email').then((r) => r.json())
    const matching = (mail as { to: { address: string }[] }[]).filter((m) =>
      m.to.some((t) => t.address.toLowerCase() === email),
    )
    expect(matching).toHaveLength(0)
  })
})

test.describe('email change in DAV', () => {
  test('changing email in DAV invalidates active sessions on next sync', async ({
    page,
    context,
  }) => {
    const uid = 'edge-email-change-1'
    const oldEmail = 'rename-old@example.com'
    const newEmail = 'rename-new@example.com'
    await createDavUser({ uid, email: oldEmail, displayName: 'Rename Me' })
    await triggerSync()

    await page.goto('/login')
    await preparePage(page)
    await page.locator('#email-address-icon').fill(oldEmail)
    await page.getByRole('button', { name: 'Einloggen' }).click()
    await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })
    const mail = await waitForMailFor(oldEmail)
    const token = extractLoginTokenFromMail(mail)
    await page.goto(`/login/${token}`)
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })

    // Confirm session works
    let resp = await context.request.get('/api/calendars')
    expect(resp.status()).toBe(200)

    // Now change the email in DAV and re-sync
    await updateDavUser(uid, { email: newEmail, displayName: 'Rename Me' })
    const syncResult = await triggerSync()
    expect(syncResult.updated).toBeGreaterThanOrEqual(1)

    // The previously-issued session should now fail (revoked by sync)
    resp = await context.request.get('/api/calendars')
    expect([401, 403]).toContain(resp.status())
  })
})

test.describe('token expiry', () => {
  test('expired login token is rejected with 401', async ({ request }) => {
    const uid = 'edge-token-expiry-1'
    const email = 'expire-me@example.com'
    await createDavUser({ uid, email, displayName: 'Expire Me' })
    await triggerSync()

    // Request a login link to get a token in the DB
    await request.post('/api/requestLoginLink', { data: { email } })
    const mail = await waitForMailFor(email)
    const token = extractLoginTokenFromMail(mail)

    // Force-expire the token by writing a past expires_at
    mariadb(`UPDATE login_tokens SET expires_at = '2000-01-01 00:00:00' WHERE token = '${token}'`)

    const resp = await request.post('/api/redeemLoginLink', { data: { token } })
    expect(resp.status()).toBe(401)
  })
})

test.describe('lazy-fallback', () => {
  test('user added directly in DAV (no sync) can log in via lazy fallback', async () => {
    const uid = 'edge-lazy-1'
    const email = 'lazy-fallback@example.com'
    await createDavUser({ uid, email, displayName: 'Lazy Fallback' })
    // Intentionally NO triggerSync() — login should pull this user in on demand.

    expect(mariadb(`SELECT email FROM users WHERE email = '${email}'`)).toBe('')

    const resp = await fetch('http://localhost:3000/api/requestLoginLink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    expect(resp.status).toBe(200)

    const mail = await waitForMailFor(email)
    expect(mail.subject).toContain('Login')

    expect(mariadb(`SELECT email FROM users WHERE email = '${email}'`)).toBe(email)
  })
})

test.describe('admin tag management', () => {
  test('admin can set a tag on an existing user via API', async ({ page, context }) => {
    const adminEmail = 'admin@example.com'
    const targetEmail = 'alice@example.com'

    // Login as admin
    await page.goto('/login')
    await preparePage(page)
    await page.locator('#email-address-icon').fill(adminEmail)
    await page.getByRole('button', { name: 'Einloggen' }).click()
    await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })
    const mail = await waitForMailFor(adminEmail)
    const token = extractLoginTokenFromMail(mail)
    await page.goto(`/login/${token}`)
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })

    // Set 'veranstalter' tag on alice via the admin API. Admin endpoints
    // continue to round-trip through DAV, so success means the VCard's
    // CATEGORIES property gets updated.
    const resp = await context.request.post('/api/admin/updateUserTags', {
      data: {
        email: targetEmail,
        tags: [{ name: 'veranstalter', state: true }],
        sendMail: false,
      },
    })
    expect(resp.status()).toBe(200)

    // Verify the tag landed in alice's VCard
    const vcardUrl = getVCardUrlByEmail(targetEmail)
    expect(vcardUrl).not.toBeNull()
    const vc = await fetch(vcardUrl!, {
      headers: {
        Authorization: 'Basic ' + Buffer.from('admin:admin').toString('base64'),
      },
    })
    const body = await vc.text()
    expect(body).toContain('CATEGORIES')
    expect(body).toContain('veranstalter')
  })
})
