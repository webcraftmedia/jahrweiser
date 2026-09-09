import { expect, test } from '@playwright/test'

import { readTelegramChannelOrder, setTelegramChannels } from './helpers/db'
import {
  deleteAllMail,
  extractLoginTokenFromMail,
  preparePage,
  waitForMailFor,
} from './helpers/maildev'
import { runSeedDemo, runSeedReset } from './helpers/stack'

import type { Page } from '@playwright/test'

const ADMIN = 'admin@example.com'
const ALICE = 'alice@example.com'

const SEEDED = [
  { name: 'E2E Erster', url: 'https://t.me/e2e_first', public: true },
  { name: 'E2E Zweiter', url: 'https://t.me/e2e_second', public: false },
]

test.beforeAll(async () => {
  runSeedReset()
  runSeedDemo()
})

test.afterAll(async () => {
  await setTelegramChannels([])
})

test.beforeEach(async () => {
  await deleteAllMail()
  await setTelegramChannels(SEEDED)
})

async function loginViaMagicLink(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await preparePage(page)
  await page.locator('#email-address-icon').fill(email)
  await page.getByRole('button', { name: 'Einloggen' }).click()
  await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })
  const mail = await waitForMailFor(email)
  await page.goto(`/login/${extractLoginTokenFromMail(mail)}`)
  await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })
}

test.describe('admin: editing the Telegram channels', () => {
  // One login for the whole flow — each step builds on the previous one's
  // state in the table.
  test('adds, reorders, edits and deletes a channel', async ({ page }) => {
    await loginViaMagicLink(page, ADMIN)
    await page.goto('/admin/telegram')
    await preparePage(page)

    const rows = page.locator('li')
    await expect(rows).toHaveCount(2)

    // 1. Adding. The link is checked before the button unlocks.
    await page.locator('#channel-name').fill('E2E Dritter')
    await page.locator('#channel-url').fill('https://example.com/not-telegram')
    await expect(page.getByText('Das ist kein Telegram-Link')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kanal hinzufügen' })).toBeDisabled()

    await page.locator('#channel-url').fill('https://t.me/e2e_third')
    await page.locator('#channel-description').fill('Frisch angelegt')
    await page.getByRole('button', { name: 'Kanal hinzufügen' }).click()
    await expect(rows).toHaveCount(3, { timeout: 10_000 })
    // Appended, not prepended — the existing order is not disturbed.
    expect(await readTelegramChannelOrder()).toStrictEqual([
      'E2E Erster',
      'E2E Zweiter',
      'E2E Dritter',
    ])

    // 2. Reordering. This is the part the unit tests cannot prove: that
    //    `ORDER BY sort_order` really produces this order out of MariaDB.
    await rows.nth(2).getByRole('button', { name: 'Nach oben schieben' }).click()
    await expect
      .poll(async () => readTelegramChannelOrder(), { timeout: 10_000 })
      .toStrictEqual(['E2E Erster', 'E2E Dritter', 'E2E Zweiter'])

    // 3. Editing in place.
    const third = page.locator('li', { hasText: 'E2E Dritter' })
    await third.getByRole('button', { name: 'Bearbeiten' }).click()
    await third.getByLabel('Name').fill('E2E Dritter (neu)')
    await third.getByRole('button', { name: 'Speichern' }).click()
    await expect(page.getByText('E2E Dritter (neu)')).toBeVisible({ timeout: 10_000 })

    // 4. What the members see — same list, same order, through the member page.
    await page.goto('/telegram')
    await preparePage(page)
    await expect(page.locator('li a[href^="https://t.me/"]')).toHaveCount(3)
    await expect(page.locator('li')).toContainText([
      'E2E Erster',
      'E2E Dritter (neu)',
      'E2E Zweiter',
    ])

    // 5. Deleting takes two clicks.
    await page.goto('/admin/telegram')
    await preparePage(page)
    const doomed = page.locator('li', { hasText: 'E2E Dritter (neu)' })
    await doomed.getByRole('button', { name: 'Löschen', exact: true }).click()
    await doomed.getByRole('button', { name: 'Wirklich löschen' }).click()
    await expect(page.locator('li', { hasText: 'E2E Dritter' })).toHaveCount(0, { timeout: 10_000 })
    expect(await readTelegramChannelOrder()).toStrictEqual(['E2E Erster', 'E2E Zweiter'])
  })

  test('is closed to members and to anonymous requests', async ({ page, browser }) => {
    // The middleware hides the page; these are the endpoints behind it, which
    // is what an ordinary member could actually reach.
    await loginViaMagicLink(page, ALICE)
    const asMember = await page.context().request.post('/api/admin/telegram-channels/create', {
      data: { name: 'Geschmuggelt', url: 'https://t.me/smuggled' },
    })
    expect(asMember.status()).toBe(403)

    const guestContext = await browser.newContext()
    const anonymous = await guestContext.request.post('/api/admin/telegram-channels/create', {
      data: { name: 'Anonym', url: 'https://t.me/anon' },
    })
    expect(anonymous.status()).toBe(401)
    await guestContext.close()

    // Neither attempt reached the table.
    expect(await readTelegramChannelOrder()).toStrictEqual(['E2E Erster', 'E2E Zweiter'])
  })
})
