import { expect, test } from '@playwright/test'

import {
  DEFAULT_USER,
  loginAs,
  mockCalendarEndpoints,
  mockMapEndpoints,
  navigateClientSide,
} from './helpers/api-mocks'

test.describe('Karte', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
    await mockCalendarEndpoints(page)
  })

  test('is reachable from the icon rail and draws the members', async ({ page }) => {
    await mockMapEndpoints(page)
    await navigateClientSide(page, '/')

    await page.locator('nav a[href="/karte"]').first().click()
    await expect(page).toHaveURL(/\/karte$/)

    // One shape per postal code, and the numbers on top of them.
    await expect(page.locator('.areas path')).toHaveCount(2)
    await expect(page.getByText('7', { exact: true }).first()).toBeVisible()
    // The same numbers again, for readers who never see the map.
    await expect(page.locator('table')).toContainText('Zwingenberg')
  })

  test('opens on what the members cover, and zooms from there', async ({ page }) => {
    await mockMapEndpoints(page)
    await navigateClientSide(page, '/karte')

    const svg = page.locator('svg[role="img"]')
    const opened = await svg.getAttribute('viewBox')
    // Fitted to the two areas, not the whole country.
    expect(Number(opened?.split(' ')[2])).toBeLessThan(4000)

    await page.getByRole('button', { name: 'Karte vergrößern' }).click()
    await expect
      .poll(async () => Number((await svg.getAttribute('viewBox'))?.split(' ')[2]))
      .toBeLessThan(Number(opened?.split(' ')[2]))
  })

  test('writes the names of the places it has room for', async ({ page }) => {
    await mockMapEndpoints(page)
    await navigateClientSide(page, '/karte')
    await expect(page.locator('.places text').first()).toBeVisible()
  })

  test('fits the page instead of scrolling it', async ({ page }) => {
    // The map is meant to be zoomed, not scrolled past.
    await mockMapEndpoints(page)
    await navigateClientSide(page, '/karte')
    await expect(page.locator('.areas path')).toHaveCount(2)
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const el = document.querySelector('.content')
          return el ? el.scrollHeight - el.clientHeight : -1
        }),
      )
      .toBe(0)
  })

  test.describe('without a postal code', () => {
    test('marks the rail entry', async ({ page }) => {
      await mockMapEndpoints(page, { locked: true })
      await navigateClientSide(page, '/')
      await expect(page.locator('nav a[href="/karte"] .rail-warn').first()).toBeVisible()
    })

    test('shows a blurred preview and points at the settings', async ({ page }) => {
      await mockMapEndpoints(page, { locked: true })
      await navigateClientSide(page, '/karte')

      await expect(page.getByRole('heading', { name: 'Karte freischalten' })).toBeVisible()
      const cta = page.getByRole('link', { name: 'Postleitzahl hinterlegen' })
      await expect(cta).toBeVisible()

      // Nothing real is in the page — the preview is invented on the client.
      await expect(page.locator('body')).not.toContainText('Zwingenberg')
      await expect(page.locator('table')).toHaveCount(0)

      await cta.click()
      await expect(page).toHaveURL(/\/settings\/profile$/)
    })
  })
})
