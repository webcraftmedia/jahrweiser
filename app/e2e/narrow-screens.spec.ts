import { test, expect } from '@playwright/test'

import { DEFAULT_USER, loginAs, mockRequestLoginLink, waitForHydration } from './helpers/api-mocks'

import type { Locator, Page } from '@playwright/test'

/**
 * The narrowest phones in use, and the app's own zoom on top of them (the
 * settings allow up to 1.8). 280px is a folded Galaxy Z Fold's cover screen,
 * 320px a small Galaxy A or an iPhone SE (1st gen), 360px the common Android
 * width.
 */
const WIDTHS = [280, 320, 360]
const ZOOMS = [1, 1.8]

async function useZoom(page: Page, zoom: number) {
  await page.addInitScript((level) => {
    localStorage.setItem('jahrweiser-zoom', String(level))
  }, zoom)
}

/** Nothing sticks out sideways — the page itself never scrolls horizontally. */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

/** Every visible control in `scope` lies entirely inside the viewport. */
async function expectControlsInView(scope: Locator) {
  const outside = await scope.evaluate((container) =>
    [...container.querySelectorAll<HTMLElement>('input, button, a')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.left < -0.5 || box.right > innerWidth + 0.5))
      .map(({ el }) => el.outerHTML.slice(0, 80)),
  )
  expect(outside).toEqual([])
}

for (const width of WIDTHS) {
  for (const zoom of ZOOMS) {
    test.describe(`${width}px wide, zoom ${zoom}`, () => {
      test.use({ viewport: { width, height: 640 } })

      test.beforeEach(async ({ page }) => {
        await useZoom(page, zoom)
      })

      test('the login form fits', async ({ page }) => {
        await page.goto('/login')
        await waitForHydration(page)

        await expect(page.locator('#email-address-icon')).toBeVisible()
        await expectNoHorizontalOverflow(page)
        await expectControlsInView(page.locator('body'))
      })

      test('the code field shows the whole code', async ({ page }) => {
        await mockRequestLoginLink(page)
        await page.goto('/login')
        await waitForHydration(page)
        await page.locator('#email-address-icon').fill('test@example.com')
        await page.getByRole('button', { name: 'Einloggen' }).click()

        const code = page.locator('#login-code')
        await expect(code).toBeVisible()
        // Six digits with the grouping space, as the mail shows them.
        await code.fill('123 456')
        const clipped = await code.evaluate((el) => el.scrollWidth - el.clientWidth)
        expect(clipped).toBeLessThanOrEqual(0)
        await expectNoHorizontalOverflow(page)
        await expectControlsInView(page.locator('body'))
      })

      test('the header stays one row with the menu top right', async ({ page }) => {
        await loginAs(page, DEFAULT_USER)
        await waitForHydration(page)

        const menu = page.getByRole('button', { name: 'Menü öffnen' })
        const nav = page.locator('nav').filter({ has: menu })
        await expect(menu).toBeVisible()

        // Measured in one go: the calendar scrolls the page into place after
        // loading, and two separate reads may straddle that.
        const bar = await nav.evaluate((el) => {
          const logo = el.querySelector('a[href="/"]')!.getBoundingClientRect()
          const button = el
            .querySelector('[aria-controls="navbar-mobile"]')!
            .getBoundingClientRect()
          return {
            centres: Math.abs(logo.top + logo.height / 2 - (button.top + button.height / 2)),
            rightGap: innerWidth - button.right,
            // The bar only, not the page: at 280px and the largest zoom the
            // calendar below is wider than the screen, which is its own matter.
            overflow: el.scrollWidth - el.clientWidth,
          }
        })
        // Same row: the vertical centres line up.
        expect(bar.centres).toBeLessThan(4)
        // Right edge: only the bar's own padding to the side of it.
        expect(bar.rightGap).toBeLessThan(16)
        expect(bar.overflow).toBeLessThanOrEqual(0)

        await menu.click()
        await expect(page.locator('#navbar-mobile')).toHaveClass(/menu-open/)
        await expectControlsInView(page.locator('#navbar-mobile'))
      })
    })
  }
}
