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

// The one test that deliberately empties a name gets a user of its own. The
// seed runs once per file, not per test, so clearing Alice's name would leave
// the next test — which opens the form expecting it pre-filled — waiting for a
// value that nobody is going to write. That test then only passed on a retry,
// because a retry restarts the worker and re-runs the seed, which is exactly
// what made it look like a timing flake.
const BOB = 'bob@example.com'

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

    await page.goto('/settings/profile')
    await preparePage(page)
    // The form is pre-filled from DAV (source of truth).
    await expect(page.locator('#settings-firstName')).toHaveValue(/.+/, { timeout: 10_000 })

    await page.locator('#settings-firstName').fill('Alicia')
    await page.locator('#settings-lastName').fill('Wonder')
    await page.locator('#settings-postalCode').fill('64653')
    // Checked against the map's own geometry while typing — the form names the
    // place back before it lets the code be saved.
    await expect(page.getByText('64653 — Lorsch')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Speichern' }).click()
    await expect(page.getByText('Gespeichert.')).toBeVisible({ timeout: 10_000 })

    // The header greeting reflects the new first name without a re-login.
    await expect(page.getByText('Alicia').first()).toBeVisible({ timeout: 10_000 })

    // Persisted: a fresh load reads the new name and postal code back from DAV.
    await page.reload()
    await preparePage(page)
    await expect(page.locator('#settings-firstName')).toHaveValue('Alicia', { timeout: 10_000 })
    await expect(page.locator('#settings-lastName')).toHaveValue('Wonder')
    await expect(page.locator('#settings-postalCode')).toHaveValue('64653')
  })

  test('saving a blank name clears the stored name', async ({ page }) => {
    await loginViaMagicLink(page, BOB)
    const res = await page.context().request.post('/api/me/profile', {
      data: { firstName: '', lastName: '', postalCode: '' },
    })
    expect(res.status()).toBe(200)

    const get = await page.context().request.get('/api/me/profile')
    const body = (await get.json()) as { firstName: string; lastName: string }
    expect(body.firstName).toBe('')
    expect(body.lastName).toBe('')
  })

  test('the form refuses a postal code the map cannot place', async ({ page }) => {
    await loginViaMagicLink(page, ALICE)
    await page.goto('/settings/profile')
    await preparePage(page)
    await expect(page.locator('#settings-firstName')).toHaveValue(/.+/, { timeout: 10_000 })

    // Five digits, and no area in Germany — the mistake a format check passes.
    await page.locator('#settings-postalCode').fill('99999')
    await expect(page.getByText('Diese Postleitzahl kennt die Karte nicht.')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeDisabled()

    await page.locator('#settings-postalCode').fill('646')
    await expect(page.getByText('besteht aus fünf Ziffern')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })

  test('the endpoint refuses one too, whatever the form allowed', async ({ page }) => {
    // The form is a convenience; this is the guarantee. Nothing may reach the
    // sidecar that the map would then have to report as unlocated.
    await loginViaMagicLink(page, ALICE)
    const refused = await page.context().request.post('/api/me/profile', {
      data: { firstName: 'Alice', lastName: 'Example', postalCode: '99999' },
    })
    expect(refused.status()).toBe(400)

    // And what it accepts, it stores normalised.
    const accepted = await page.context().request.post('/api/me/profile', {
      data: { firstName: 'Alice', lastName: 'Example', postalCode: 'D-64673' },
    })
    expect(accepted.status()).toBe(200)
    const get = await page.context().request.get('/api/me/profile')
    expect(((await get.json()) as { postalCode: string }).postalCode).toBe('64673')
  })

  test('the map opens only for a member it can place', async ({ page }) => {
    await loginViaMagicLink(page, ALICE)
    const api = page.context().request
    const setPostalCode = (postalCode: string) =>
      api.post('/api/me/profile', {
        data: { firstName: 'Alice', lastName: 'Example', postalCode },
      })
    const status = async () =>
      ((await (await api.get('/api/map/status')).json()) as { hasPostalCode: boolean })
        .hasPostalCode

    await setPostalCode('64673')
    expect(await status()).toBe(true)
    expect((await api.get('/api/map/members')).status()).toBe(200)

    // Cleared — the state the seeded admin is in, and the one the page answers
    // with its blurred preview.
    await setPostalCode('')
    expect(await status()).toBe(false)
    expect((await api.get('/api/map/members')).status()).toBe(403)
  })

  test('the name endpoints require authentication', async ({ request }) => {
    expect((await request.get('/api/me/profile')).status()).toBe(401)
    expect(
      (await request.post('/api/me/profile', { data: { firstName: 'A', lastName: 'B' } })).status(),
    ).toBe(401)
  })
})
