import { devices, expect, test } from '@playwright/test'

import { DEFAULT_USER, loginAs } from './helpers/api-mocks'

/**
 * The installed app has no reload button and no pull-to-refresh of its own;
 * it brings both (src/composables/useRefreshable.ts). Started from the home
 * screen is emulated the way iOS reports it — Chromium cannot emulate
 * `display-mode: standalone`.
 */

const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']

async function calendarRequests(page: import('@playwright/test').Page) {
  let count = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/calendars')) count++
  })
  return () => count
}

test.describe('refresh in the installed app', () => {
  test.use({ userAgent, viewport, deviceScaleFactor, isMobile, hasTouch })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true })
    })
    await loginAs(page, DEFAULT_USER)
    await expect(page.getByText('Jahresversammlung').first()).toBeVisible()
  })

  test('the header button asks the server again', async ({ page }) => {
    const requests = await calendarRequests(page)
    await page.getByRole('button', { name: 'Aktualisieren' }).click()
    await expect.poll(requests).toBe(1)
    await expect(page.getByRole('button', { name: 'Aktualisieren' })).toBeEnabled()
  })

  test('pulling the calendar down at its top does the same', async ({ page }) => {
    const requests = await calendarRequests(page)
    const cal = page.locator('.cal-wrapper')
    const box = (await cal.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + 20
    // Touch events by hand: Playwright's touchscreen only taps.
    await cal.dispatchEvent('touchstart', {
      touches: [{ identifier: 0, clientX: x, clientY: y }],
      changedTouches: [{ identifier: 0, clientX: x, clientY: y }],
    })
    await cal.dispatchEvent('touchmove', {
      touches: [{ identifier: 0, clientX: x, clientY: y + 200 }],
      changedTouches: [{ identifier: 0, clientX: x, clientY: y + 200 }],
    })
    await expect(page.locator('.pull-indicator--armed')).toBeVisible()
    await cal.dispatchEvent('touchend', {
      touches: [],
      changedTouches: [{ identifier: 0, clientX: x, clientY: y + 200 }],
    })
    await expect.poll(requests).toBe(1)
  })
})

test.describe('refresh in a browser tab', () => {
  test.use({ userAgent, viewport, deviceScaleFactor, isMobile, hasTouch })

  test('has no button — the browser brings its own', async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
    await expect(page.getByText('Jahresversammlung').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aktualisieren' })).toHaveCount(0)
  })
})
