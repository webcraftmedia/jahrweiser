import { expect, test } from '@playwright/test'

import {
  deleteAllMail,
  extractLoginTokenFromMail,
  preparePage,
  waitForMailFor,
} from './helpers/maildev'
import { runSeedDemo, runSeedReset } from './helpers/stack'

const ADMIN = 'admin@example.com'
// A fresh address that the demo seed does not create, so registration always
// hits the "new account" path.
const NEWCOMER = 'newcomer@example.com'
// A seeded user that already exists — re-registering with it must hit the
// "existing account" path (login link, no new join).
const ALICE = 'alice@example.com'

test.beforeAll(() => {
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

async function createLink(
  page: import('@playwright/test').Page,
  body: { label?: string; duration: string; maxUses?: number },
): Promise<{ token: string; url: string }> {
  const resp = await page.context().request.post('/api/admin/registration-links/create', {
    data: body,
  })
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()) as { token: string; url: string }
}

test.describe('registration via link', () => {
  test('admin creates a link and a newcomer self-registers + verifies via email', async ({
    page,
    browser,
  }) => {
    // 1. Admin logs in and mints a registration link.
    await loginViaMagicLink(page, ADMIN)
    const { token } = await createLink(page, { label: 'E2E Flyer', duration: '30d' })
    expect(token).toBeTruthy()

    // 2. An anonymous visitor opens the link and registers.
    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await guest.goto(`/register/${token}`)
    await preparePage(guest)
    await guest.locator('#firstName').fill('New')
    await guest.locator('#lastName').fill('Comer')
    await guest.locator('#email').fill(NEWCOMER)
    await guest.getByRole('button', { name: 'Konto anlegen' }).click()
    await expect(guest.getByText('Fast geschafft!')).toBeVisible({ timeout: 10_000 })

    // 3. The verification email logs the new user in via the same magic link.
    const mail = await waitForMailFor(NEWCOMER)
    const loginToken = extractLoginTokenFromMail(mail)
    await guest.goto(`/login/${loginToken}`)
    await expect(guest).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })

    // 4. The admin's list now reports one join for the link.
    const listResp = await page.context().request.get('/api/admin/registration-links/list')
    expect(listResp.ok()).toBeTruthy()
    const links = (await listResp.json()) as { token: string; useCount: number }[]
    const row = links.find((l) => l.token === token)
    expect(row?.useCount).toBe(1)

    await guestContext.close()
  })

  test('a revoked link cannot be used to register', async ({ page, browser }) => {
    await loginViaMagicLink(page, ADMIN)
    const { token } = await createLink(page, { label: 'E2E Revoked', duration: '30d' })

    const revokeResp = await page
      .context()
      .request.post('/api/admin/registration-links/revoke', { data: { token } })
    expect(revokeResp.ok()).toBeTruthy()

    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await guest.goto(`/register/${token}`)
    await preparePage(guest)
    await expect(guest.getByText('Link nicht nutzbar')).toBeVisible({ timeout: 10_000 })
    expect(await guest.locator('#email').count()).toBe(0)

    await guestContext.close()
  })

  test('re-registering an existing email sends a login link without counting a join', async ({
    page,
    browser,
  }) => {
    await loginViaMagicLink(page, ADMIN)
    const { token } = await createLink(page, { label: 'E2E Existing', duration: '30d' })

    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await guest.goto(`/register/${token}`)
    await preparePage(guest)
    await guest.locator('#firstName').fill('Alice')
    await guest.locator('#lastName').fill('Example')
    await guest.locator('#email').fill(ALICE)
    await guest.getByRole('button', { name: 'Konto anlegen' }).click()
    await expect(guest.getByText('Fast geschafft!')).toBeVisible({ timeout: 10_000 })

    // The existing user still receives a login link...
    const mail = await waitForMailFor(ALICE)
    expect(mail).toBeTruthy()

    // ...but re-registering is not counted as a join.
    const listResp = await page.context().request.get('/api/admin/registration-links/list')
    const links = (await listResp.json()) as { token: string; useCount: number }[]
    expect(links.find((l) => l.token === token)?.useCount).toBe(0)

    await guestContext.close()
  })

  test('an admin can rename, deactivate, reactivate and delete a link', async ({ page }) => {
    await loginViaMagicLink(page, ADMIN)
    const { token } = await createLink(page, { label: 'Before', duration: '30d' })
    const req = page.context().request

    const row = async () => {
      const links = (await (await req.get('/api/admin/registration-links/list')).json()) as {
        token: string
        label: string | null
        status: string
      }[]
      return links.find((l) => l.token === token)
    }

    // Rename.
    expect(
      (
        await req.post('/api/admin/registration-links/update', { data: { token, label: 'After' } })
      ).ok(),
    ).toBeTruthy()
    expect((await row())?.label).toBe('After')

    // An active link cannot be deleted — deactivate first.
    expect(
      (await req.post('/api/admin/registration-links/delete', { data: { token } })).status(),
    ).toBe(409)

    // Deactivate → reactivate (back to valid) → deactivate again.
    expect(
      (await req.post('/api/admin/registration-links/revoke', { data: { token } })).ok(),
    ).toBeTruthy()
    expect((await row())?.status).toBe('revoked')
    expect(
      (await req.post('/api/admin/registration-links/reactivate', { data: { token } })).ok(),
    ).toBeTruthy()
    expect((await row())?.status).toBe('valid')
    expect(
      (await req.post('/api/admin/registration-links/revoke', { data: { token } })).ok(),
    ).toBeTruthy()

    // Now deletable.
    expect(
      (await req.post('/api/admin/registration-links/delete', { data: { token } })).ok(),
    ).toBeTruthy()
    expect(await row()).toBeUndefined()
  })

  test('registration endpoints reject anonymous admin access', async ({ request }) => {
    const create = await request.post('/api/admin/registration-links/create', {
      data: { duration: '30d' },
    })
    expect(create.status()).toBe(401)
    const list = await request.get('/api/admin/registration-links/list')
    expect(list.status()).toBe(401)
  })
})
