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

test.describe('Layout: mobile menu', () => {
  test.use({ viewport: { width: 390, height: 640 } })

  test('a long calendar list keeps the page from scrolling', async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
    // Registered after loginAs, so it replaces the two default calendars: a
    // list long enough to make the menu taller than the screen.
    await page.route('**/api/calendars', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          Array.from({ length: 40 }, (_, i) => ({ name: `Kalender ${i + 1}`, color: '#3b82f6' })),
        ),
      }),
    )
    // Away and back, so the calendar loads the list again.
    await navigateClientSide(page, '/settings')
    await page.waitForURL('/settings')
    await navigateClientSide(page, '/')
    await page.waitForURL('/')
    await waitForHydration(page)

    const menu = page.locator('#navbar-mobile')
    await expect(menu.getByRole('button', { name: 'Kalender 40' })).toBeAttached()

    // Closed: the menu takes no room, the document is exactly the screen.
    const pageOverflow = () =>
      page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
    expect(await pageOverflow()).toBeLessThanOrEqual(0)
    expect(await page.evaluate(() => scrollY)).toBe(0)

    // Open: it ends at the bottom edge and scrolls in itself.
    await page.locator('[aria-controls="navbar-mobile"]').click()
    await expect(menu).toHaveClass(/menu-open/)
    const box = (await menu.boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(640 + 0.5)
    expect(await pageOverflow()).toBeLessThanOrEqual(0)
    const last = menu.getByRole('button', { name: 'Kalender 40' })
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
    expect(await page.evaluate(() => scrollY)).toBe(0)
  })
})
