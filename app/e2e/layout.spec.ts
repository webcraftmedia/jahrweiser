import { test, expect } from '@playwright/test'

import { loginAs, DEFAULT_USER, navigateClientSide, waitForHydration } from './helpers/api-mocks'

/**
 * Enough issues that /blaettchen is taller than any viewport — the archive is
 * the longest page in the app and the one the rail used to scroll away on.
 */
const MANY_ISSUES = {
  issues: Array.from({ length: 40 }, (_, i) => ({
    number: 40 - i,
    date: '2026-05-01',
    file: `${40 - i}_2026-05-01.pdf`,
  })),
  contact: 'redaktion@example.com',
}

test.describe('Layout: desktop icon rail', () => {
  test('stays put while a long page scrolls', async ({ page }) => {
    await loginAs(page, DEFAULT_USER)

    // Registered after loginAs on purpose: Playwright matches routes in reverse
    // order of registration, so this replaces the single-issue default.
    await page.route('**/api/blaettchen', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MANY_ISSUES),
      }),
    )

    await navigateClientSide(page, '/blaettchen')
    await waitForHydration(page)

    const rail = page.locator('nav[aria-label="Hauptnavigation"]').first()
    const heading = page.getByRole('heading', { name: 'Blättchen', level: 1 })
    await expect(rail).toBeVisible()
    await expect(heading).toBeVisible()

    const railBefore = await rail.boundingBox()
    const headingBefore = await heading.boundingBox()

    // Over the content column, not the rail: whichever container scrolls there
    // is the one a reader uses.
    await page.mouse.move(800, 400)
    await page.mouse.wheel(0, 1200)
    // The wheel is asynchronous; wait for the content to have moved rather than
    // for a fixed delay.
    await expect
      .poll(async () => (await heading.boundingBox())!.y)
      .toBeLessThan(headingBefore!.y - 100)

    const railAfter = await rail.boundingBox()
    expect(railAfter!.y).toBeCloseTo(railBefore!.y, 0)
    expect(railAfter!.height).toBeCloseTo(railBefore!.height, 0)
  })
})
