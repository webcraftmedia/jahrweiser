import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import {
  extractLoginTokenFromMail,
  preparePage,
  waitForMailFor,
  deleteAllMail,
} from './helpers/maildev'
import { runSeedDemo, runSeedReset } from './helpers/stack'

import type { Page } from '@playwright/test'

const ALICE = 'alice@example.com'

// The real file is git-ignored (an invite link is the permission itself), so
// the suite writes its own and removes it afterwards. Same path the server
// resolves from its cwd — see TELEGRAM_CHANNELS_FILE in nuxt.config.ts.
const CHANNELS_FILE = path.resolve(process.cwd(), 'data/telegram-channels.json')
const CHANNELS = [
  { name: 'E2E Öffentlich', description: 'Für alle', url: 'https://t.me/e2e_public', public: true },
  { name: 'E2E Privat', url: 'https://t.me/+E2ePrivateInvite', public: false },
]

// A developer running this suite locally may well have a real channel file in
// place. Stash it and put it back, rather than deleting their configuration.
let previousChannels: string | null = null

test.beforeAll(async () => {
  runSeedReset()
  runSeedDemo()
  previousChannels = await readFile(CHANNELS_FILE, 'utf-8').catch(() => null)
  await mkdir(path.dirname(CHANNELS_FILE), { recursive: true })
  await writeFile(CHANNELS_FILE, JSON.stringify(CHANNELS, null, 2), 'utf-8')
})

test.afterAll(async () => {
  if (previousChannels === null) {
    await rm(CHANNELS_FILE, { force: true })
  } else {
    await writeFile(CHANNELS_FILE, previousChannels, 'utf-8')
  }
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
  await page.goto(`/login/${extractLoginTokenFromMail(mail)}`)
  await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })
}

test.describe('icon rail', () => {
  // One login for the whole flow: /api/requestLoginLink is rate-limited per
  // user, so a login per test would be flaky.
  test('navigates between calendar and telegram and tracks the active section', async ({
    page,
    browser,
  }) => {
    await loginViaMagicLink(page, ALICE)

    // The calendar redirected to /YYYY/MM — the rail must still mark it active,
    // which is the part a mocked useRoute in the unit test cannot prove.
    const rail = page
      .locator('nav[aria-label]')
      .filter({ has: page.locator('a[href="/telegram"]') })
    const desktopRail = rail.first()
    await expect(desktopRail).toBeVisible()
    await expect(desktopRail.locator('a[href="/"]')).toHaveAttribute('aria-current', 'page')
    await expect(desktopRail.locator('a[href="/telegram"]')).not.toHaveAttribute(
      'aria-current',
      'page',
    )
    // Icons only — no visible link text in the rail.
    expect((await desktopRail.innerText()).trim()).toBe('')

    // Navigate via the rail itself.
    await desktopRail.locator('a[href="/telegram"]').click()
    await expect(page).toHaveURL(/\/telegram$/)
    await expect(desktopRail.locator('a[href="/telegram"]')).toHaveAttribute('aria-current', 'page')
    await expect(desktopRail.locator('a[href="/"]')).not.toHaveAttribute('aria-current', 'page')

    // The channels come from the git-ignored file via the authenticated API.
    await expect(page.getByText('E2E Öffentlich')).toBeVisible({ timeout: 10_000 })
    const privateLink = page.getByRole('link', { name: 'Beitreten' }).nth(1)
    await expect(privateLink).toHaveAttribute('href', 'https://t.me/+E2ePrivateInvite')
    await expect(privateLink).toHaveAttribute('target', '_blank')

    // Back to the calendar through the rail.
    await desktopRail.locator('a[href="/"]').click()
    // The calendar settles on its dated permalink, same as after login.
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/)

    // An anonymous visitor gets neither the page nor the invitations.
    const guestContext = await browser.newContext()
    const anonymous = await guestContext.request.get('/api/telegram-channels')
    expect(anonymous.status()).toBe(401)
    await guestContext.close()
  })
})
