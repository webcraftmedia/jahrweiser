import { expect, test } from '@playwright/test'

import {
  deleteAllMail,
  extractLoginCodeFromMail,
  extractLoginTokenFromMail,
  openLoginLink,
  waitForMailFor,
} from './helpers/maildev'
import { COLD_START_MS, requestLoginLink } from './helpers/session'
import { runSeedDemo, runSeedReset } from './helpers/stack'

// The login code: typed into the browser that asked for it, for when the link
// would log in another one (iOS home-screen app, a mail app's own browser).
const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const CAROL = 'carol@example.com'

test.beforeAll(async () => {
  runSeedReset()
  runSeedDemo()
})

test.beforeEach(async () => {
  await deleteAllMail()
})

test.describe('login by code', () => {
  test('logs in by the code from the mail and spends the link with it', async ({ page }) => {
    await requestLoginLink(page, ALICE)
    const mail = await waitForMailFor(ALICE, COLD_START_MS)

    await page.locator('#login-code').fill(extractLoginCodeFromMail(mail))
    await page.getByRole('button', { name: 'Anmelden' }).click()
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: COLD_START_MS })

    // One credential, two ways in: the link from the same mail is gone too.
    await page.context().clearCookies()
    await openLoginLink(page, extractLoginTokenFromMail(mail))
    await expect(page.getByText('Ein Fehler…')).toBeVisible({ timeout: COLD_START_MS })
  })

  test('says how many guesses are left after a wrong code', async ({ page }) => {
    await requestLoginLink(page, BOB)
    const code = extractLoginCodeFromMail(await waitForMailFor(BOB, COLD_START_MS))
    const wrong = code === '000000' ? '111111' : '000000'

    await page.locator('#login-code').fill(wrong)
    await page.getByRole('button', { name: 'Anmelden' }).click()
    await expect(page.getByText('Der Code stimmt nicht. Noch 4 Versuche.')).toBeVisible()
  })

  test('refuses the code in a browser that did not ask for it', async ({ page, browser }) => {
    await requestLoginLink(page, CAROL)
    const code = extractLoginCodeFromMail(await waitForMailFor(CAROL, COLD_START_MS))

    // A second context has its own cookies — like the mail opened elsewhere.
    const other = await browser.newContext()
    const otherPage = await other.newPage()
    await requestLoginLink(otherPage, 'noone@example.com')
    await otherPage.locator('#login-code').fill(code)
    await otherPage.getByRole('button', { name: 'Anmelden' }).click()
    await expect(
      otherPage.getByText('Dieser Code gilt nur dort, wo du die E-Mail angefordert hast.', {
        exact: false,
      }),
    ).toBeVisible()
    await other.close()

    // The browser that asked still gets in.
    await page.locator('#login-code').fill(code)
    await page.getByRole('button', { name: 'Anmelden' }).click()
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: COLD_START_MS })
  })
})
