import { expect, test } from '@playwright/test'

import {
  DEFAULT_USER,
  loginAs,
  mockCalendarEndpoints,
  mockMapEndpoints,
  mockProfileEndpoints,
  navigateClientSide,
  railLink,
} from './helpers/api-mocks'

/**
 * The postal code is the one field in the app that is validated against real
 * data rather than against a shape — see docu/karte.md. These cover the two
 * ends of that: what the form does while it is typed, and what the icon rail
 * does the moment it is stored.
 */
test.describe('Postleitzahl in den Einstellungen', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
    await mockCalendarEndpoints(page)
  })

  test('names the place behind a code the map knows', async ({ page }) => {
    await mockMapEndpoints(page)
    await mockProfileEndpoints(page)
    await navigateClientSide(page, '/settings/profile')

    await page.locator('#settings-postalCode').fill('64673')
    await expect(page.getByText('64673 — Zwingenberg')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeEnabled()
  })

  test('refuses five digits that are not a postal code', async ({ page }) => {
    await mockMapEndpoints(page)
    await mockProfileEndpoints(page)
    await navigateClientSide(page, '/settings/profile')

    const save = page.getByRole('button', { name: 'Speichern' })
    await page.locator('#settings-postalCode').fill('99999')
    await expect(page.getByText('Diese Postleitzahl kennt die Karte nicht.')).toBeVisible()
    await expect(save).toBeDisabled()

    // And the shape, which needs no request at all.
    await page.locator('#settings-postalCode').fill('99')
    await expect(page.getByText('besteht aus fünf Ziffern')).toBeVisible()
    await expect(save).toBeDisabled()

    // Correcting it opens the button again.
    await page.locator('#settings-postalCode').fill('64625')
    await expect(page.getByText('64625 — Bensheim')).toBeVisible()
    await expect(save).toBeEnabled()
  })

  test('clears the map marker as soon as the code is saved', async ({ page }) => {
    // The marker said "your postal code is missing" while it was. It has to
    // stop saying so on the save, not on the next full page load.
    await mockMapEndpoints(page, { locked: true })
    await mockProfileEndpoints(page)
    await navigateClientSide(page, '/settings/profile')

    const marker = railLink(page, '/karte').locator('.rail-warn')
    await expect(marker).toBeVisible()

    await page.locator('#settings-postalCode').fill('64673')
    await expect(page.getByText('64673 — Zwingenberg')).toBeVisible()
    await page.getByRole('button', { name: 'Speichern' }).click()

    await expect(page.getByText('Gespeichert.')).toBeVisible()
    await expect(marker).toBeHidden()
  })

  test('puts the marker back when the code is deleted', async ({ page }) => {
    await mockMapEndpoints(page)
    await mockProfileEndpoints(page, { postalCode: '64673' })
    await navigateClientSide(page, '/settings/profile')

    const marker = railLink(page, '/karte').locator('.rail-warn')
    await expect(marker).toBeHidden()

    await page.locator('#settings-postalCode').fill('')
    await page.getByRole('button', { name: 'Speichern' }).click()
    await expect(page.getByText('Gespeichert.')).toBeVisible()
    await expect(marker).toBeVisible()
  })

  test('marks the field when the server is the one to refuse', async ({ page }) => {
    await mockMapEndpoints(page)
    await mockProfileEndpoints(page, { saveFails: true })
    await navigateClientSide(page, '/settings/profile')

    await page.locator('#settings-postalCode').fill('64673')
    await expect(page.getByText('64673 — Zwingenberg')).toBeVisible()
    await page.getByRole('button', { name: 'Speichern' }).click()

    await expect(page.getByText('Diese Postleitzahl kennt die Karte nicht.')).toBeVisible()
    await expect(page.getByText('Gespeichert.')).toBeHidden()
  })
})
