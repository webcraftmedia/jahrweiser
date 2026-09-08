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
const BOB = 'bob@example.com'

// Calendar keys the seeded admin may hand out, i.e. the X-ADMIN-TAGS on their
// vCard (cli/seed-demo.ts). These are collection URI segments, not display
// names — access is joined on the stable key, see calendarKey() in
// server/helpers/dav.ts. A link's binding is filtered against exactly this set,
// and /api/admin/getUserTags reports a user's CATEGORIES against it, which makes
// it the natural way to observe what a redemption granted.
const GRANTABLE_A = 'theater-ag'
const GRANTABLE_B = 'sportgruppe'

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
  body: { label?: string; duration: string; maxUses?: number; calendars?: string[] },
): Promise<{ token: string; url: string; calendars: string[] | null }> {
  const resp = await page.context().request.post('/api/admin/registration-links/create', {
    data: body,
  })
  expect(resp.ok()).toBeTruthy()
  return (await resp.json()) as { token: string; url: string; calendars: string[] | null }
}

interface LinkRow {
  token: string
  useCount: number
  calendars: string[] | null
  divergentUseCount: number
}

/** The admin's view of one link, as rendered by the links page. */
async function linkRow(
  page: import('@playwright/test').Page,
  token: string,
): Promise<LinkRow | undefined> {
  const resp = await page.context().request.get('/api/admin/registration-links/list')
  expect(resp.ok()).toBeTruthy()
  return ((await resp.json()) as LinkRow[]).find((l) => l.token === token)
}

/** Which of the admin's grantable calendars a user currently has access to. */
async function calendarAccess(
  page: import('@playwright/test').Page,
  email: string,
): Promise<Record<string, boolean>> {
  const resp = await page.context().request.post('/api/admin/getUserTags', { data: { email } })
  expect(resp.ok()).toBeTruthy()
  // `state` is undefined rather than false when the vCard has no CATEGORIES at
  // all (see server/api/admin/getUserTags.post.ts), so normalise it here.
  const tags = (await resp.json()) as { name: string; state: boolean | undefined }[]
  return Object.fromEntries(tags.map((t) => [t.name, Boolean(t.state)]))
}

/** Titles of all events the logged-in user can see in a calendar right now. */
async function visibleEventTitles(
  page: import('@playwright/test').Page,
  calendarName: string,
): Promise<string[]> {
  const now = new Date()
  const resp = await page.context().request.post('/api/calendar', {
    data: {
      calendar: calendarName,
      startDate: new Date(now.getTime() - 7 * 864e5).toISOString(),
      endDate: new Date(now.getTime() + 30 * 864e5).toISOString(),
    },
  })
  expect(resp.ok()).toBeTruthy()
  return ((await resp.json()) as { title: string }[]).map((e) => e.title)
}

/** Redeem a link as an anonymous visitor. */
async function registerVia(
  browser: import('@playwright/test').Browser,
  token: string,
  who: { firstName: string; lastName: string; email: string },
): Promise<void> {
  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  await guest.goto(`/register/${token}`)
  await preparePage(guest)
  await guest.locator('#firstName').fill(who.firstName)
  await guest.locator('#lastName').fill(who.lastName)
  await guest.locator('#email').fill(who.email)
  await guest.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(guest.getByText('Fast geschafft!')).toBeVisible({ timeout: 10_000 })
  await guestContext.close()
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

  test('the public registration page does not reveal the calendar binding', async ({
    page,
    browser,
  }) => {
    // An anonymous token holder learns the status and who invited them, never
    // the internal calendar names.
    await loginViaMagicLink(page, ADMIN)
    const { token } = await createLink(page, {
      label: 'E2E Secrecy',
      duration: '30d',
      calendars: [GRANTABLE_A],
    })

    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await guest.goto(`/register/${token}`)
    await preparePage(guest)
    await expect(guest.locator('#email')).toBeVisible({ timeout: 10_000 })
    expect(await guest.content()).not.toContain(GRANTABLE_A)

    const statusResp = await guest.context().request.get(`/api/register/${token}`)
    expect(JSON.stringify(await statusResp.json())).not.toContain(GRANTABLE_A)

    await guestContext.close()
  })

  test('a new account is granted the calendars the link is bound to', async ({ page, browser }) => {
    await loginViaMagicLink(page, ADMIN)
    const created = await createLink(page, {
      label: 'E2E Bound',
      duration: '30d',
      calendars: [GRANTABLE_A],
    })
    expect(created.calendars).toStrictEqual([GRANTABLE_A])

    const email = 'bound-newcomer@example.com'
    await registerVia(browser, created.token, { firstName: 'Bound', lastName: 'Newcomer', email })

    expect(await calendarAccess(page, email)).toMatchObject({
      [GRANTABLE_A]: true,
      [GRANTABLE_B]: false,
    })
    expect(await linkRow(page, created.token)).toMatchObject({ useCount: 1, divergentUseCount: 0 })
  })

  test('a link the admin may not hand out is narrowed away before it is stored', async ({
    page,
  }) => {
    // 'familie' is a real calendar, but not one the seeded admin administers.
    // The display name 'Theater AG' is rejected too: grants are keyed by URI.
    await loginViaMagicLink(page, ADMIN)
    const created = await createLink(page, {
      label: 'E2E Foreign',
      duration: '30d',
      calendars: ['familie', 'Theater AG'],
    })
    expect(created.calendars).toBeNull()
    expect(await linkRow(page, created.token)).toMatchObject({ calendars: null })
  })

  test('an existing account without the access gets it and counts as a join', async ({
    page,
    browser,
  }) => {
    await loginViaMagicLink(page, ADMIN)
    // Alice is seeded without any CATEGORIES, so the link grants her something new.
    expect(await calendarAccess(page, ALICE)).toMatchObject({ [GRANTABLE_A]: false })

    const { token } = await createLink(page, {
      label: 'E2E Existing Bound',
      duration: '30d',
      calendars: [GRANTABLE_A],
    })
    await registerVia(browser, token, { firstName: 'Alice', lastName: 'Example', email: ALICE })

    expect(await calendarAccess(page, ALICE)).toMatchObject({ [GRANTABLE_A]: true })
    expect(await linkRow(page, token)).toMatchObject({ useCount: 1 })
  })

  test('an existing account that already has the access is not counted again', async ({
    page,
    browser,
  }) => {
    await loginViaMagicLink(page, ADMIN)
    // Bob is seeded with exactly this calendar already.
    expect(await calendarAccess(page, BOB)).toMatchObject({ [GRANTABLE_B]: true })

    const { token } = await createLink(page, {
      label: 'E2E Already Granted',
      duration: '30d',
      calendars: [GRANTABLE_B],
    })
    await registerVia(browser, token, { firstName: 'Bob', lastName: 'Example', email: BOB })

    // He still gets his login link, but nothing was granted, so no join is
    // booked and no maxUses slot is burnt.
    expect(await waitForMailFor(BOB)).toBeTruthy()
    expect(await linkRow(page, token)).toMatchObject({ useCount: 0 })
  })

  test('redeeming the same bound link twice does not book a second join', async ({
    page,
    browser,
  }) => {
    await loginViaMagicLink(page, ADMIN)
    const { token } = await createLink(page, {
      label: 'E2E Twice',
      duration: '30d',
      calendars: [GRANTABLE_A],
    })

    const email = 'twice@example.com'
    await registerVia(browser, token, { firstName: 'Twice', lastName: 'Over', email })
    expect(await linkRow(page, token)).toMatchObject({ useCount: 1 })

    // The second attempt finds an account that already has the access.
    await registerVia(browser, token, { firstName: 'Twice', lastName: 'Over', email })
    expect(await linkRow(page, token)).toMatchObject({ useCount: 1 })
  })

  test('editing the binding leaves what past joins received untouched', async ({
    page,
    browser,
  }) => {
    // The whole point of snapshotting the grant per redemption: the binding may
    // be edited afterwards without rewriting history, and the admin is told the
    // two have drifted apart.
    await loginViaMagicLink(page, ADMIN)
    const { token } = await createLink(page, {
      label: 'E2E Rebound',
      duration: '30d',
      calendars: [GRANTABLE_A],
    })

    const email = 'rebound@example.com'
    await registerVia(browser, token, { firstName: 'Re', lastName: 'Bound', email })
    expect(await linkRow(page, token)).toMatchObject({ useCount: 1, divergentUseCount: 0 })

    const update = await page.context().request.post('/api/admin/registration-links/update', {
      data: { token, label: 'E2E Rebound', calendars: [GRANTABLE_B] },
    })
    expect(update.ok()).toBeTruthy()

    expect(await linkRow(page, token)).toMatchObject({
      calendars: [GRANTABLE_B],
      useCount: 1,
      divergentUseCount: 1,
    })
    // The already-registered user keeps exactly what they were granted.
    expect(await calendarAccess(page, email)).toMatchObject({
      [GRANTABLE_A]: true,
      [GRANTABLE_B]: false,
    })
  })

  test('a granted calendar actually reveals its private events', async ({ page, browser }) => {
    // The payoff the other tests only assert indirectly: CATEGORIES is not a
    // label, it is what server/api/calendar.post.ts checks before handing out
    // CLASS:PRIVATE events. Seeded private event lives in the theater-ag calendar.
    const email = 'private-viewer@example.com'
    await loginViaMagicLink(page, ADMIN)
    const { token } = await createLink(page, {
      label: 'E2E Private',
      duration: '30d',
      calendars: [GRANTABLE_A],
    })
    await registerVia(browser, token, { firstName: 'Private', lastName: 'Viewer', email })

    // The freshly registered user logs in and sees the private event...
    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await loginViaMagicLink(guest, email)
    expect(await visibleEventTitles(guest, 'Theater AG')).toContain(
      'Interne Probe (nicht oeffentlich)',
    )
    await guestContext.close()

    // ...while Alice, who was granted nothing, does not.
    const aliceContext = await browser.newContext()
    const alice = await aliceContext.newPage()
    await loginViaMagicLink(alice, ALICE)
    expect(await visibleEventTitles(alice, 'Theater AG')).not.toContain(
      'Interne Probe (nicht oeffentlich)',
    )
    await aliceContext.close()
  })

  test('renaming a calendar does not revoke access', async ({ page }) => {
    // The reason grants are keyed by collection URI: DAV:displayname is a label
    // any CalDAV client may change, and the access check only ever denies, so a
    // rename used to revoke everyone silently.
    await loginViaMagicLink(page, ADMIN)
    const calendars = (await (await page.context().request.get('/api/calendars')).json()) as {
      key: string
      name: string
    }[]
    const theater = calendars.find((c) => c.key === GRANTABLE_A)
    expect(theater).toBeDefined()
    // The admin is seeded with CATEGORIES: theater-ag, i.e. access by key.
    expect(await calendarAccess(page, ADMIN)).toMatchObject({ [GRANTABLE_A]: true })
    // Access is stored as the key, never as the display name it happens to have.
    expect(await calendarAccess(page, ADMIN)).not.toHaveProperty(theater!.name)
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
