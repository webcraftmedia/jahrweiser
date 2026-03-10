import { test, expect } from '@playwright/test'

import { loginAs, DEFAULT_USER, MOCK_EVENT_DETAIL } from './helpers/api-mocks'

test.describe('Calendar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
  })

  test('displays events in calendar', async ({ page }) => {
    await expect(
      page.locator('.sx__month-grid-event, .sx__month-agenda-event').first(),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Jahresversammlung').first()).toBeVisible()
  })

  test('clicking event opens modal with details', async ({ page }) => {
    await page.locator('.sx__month-grid-event, .sx__month-agenda-event').first().click()

    const modal = page.locator('#default-modal')
    await expect(modal).toBeVisible()
    await expect(modal.getByText(MOCK_EVENT_DETAIL.summary)).toBeVisible()
    await expect(modal.getByText(MOCK_EVENT_DETAIL.location)).toBeVisible()
  })

  test('modal can be closed', async ({ page }) => {
    await page.locator('.sx__month-grid-event, .sx__month-agenda-event').first().click()

    const modal = page.locator('#default-modal')
    await expect(modal).toBeVisible()

    await page.locator('[data-modal-hide="default-modal"]').click()
    await expect(modal).not.toBeVisible()
  })

  test('header shows welcome message and logout', async ({ page }) => {
    const navbar = page.locator('#navbar-desktop')
    await expect(navbar.getByText('Willkommen')).toBeVisible()
    // Header shows last name
    await expect(navbar.getByText('User')).toBeVisible()
    await expect(navbar.getByText('Ausloggen')).toBeVisible()
  })

  test('navigate to previous month via button', async ({ page }) => {
    await expect(
      page.locator('.sx__month-grid-event, .sx__month-agenda-event').first(),
    ).toBeVisible({ timeout: 10_000 })
    const periodLabel = page.locator('.periodLabel')
    const initialLabel = await periodLabel.textContent()

    // Click previous month button (first nav button with ‹)
    await page.locator('.cv-header-nav button').first().click()
    await expect(periodLabel).not.toHaveText(initialLabel!)
  })

  test('navigate to next month and back with today button', async ({ page }) => {
    await expect(
      page.locator('.sx__month-grid-event, .sx__month-agenda-event').first(),
    ).toBeVisible({ timeout: 10_000 })
    const periodLabel = page.locator('.periodLabel')
    const initialLabel = await periodLabel.textContent()

    // Click next month button (last nav button with ›)
    await page.locator('.cv-header-nav button').last().click()
    await expect(periodLabel).not.toHaveText(initialLabel!)

    // Click today button (middle nav button)
    await page.locator('.cv-header-nav button').nth(1).click()
    await expect(periodLabel).toHaveText(initialLabel!)
  })

  test('keyboard navigation changes month', async ({ page }) => {
    await expect(
      page.locator('.sx__month-grid-event, .sx__month-agenda-event').first(),
    ).toBeVisible({ timeout: 10_000 })
    const periodLabel = page.locator('.periodLabel')
    const initialLabel = await periodLabel.textContent()

    await page.keyboard.press('ArrowRight')
    await expect(periodLabel).not.toHaveText(initialLabel!)

    await page.keyboard.press('ArrowLeft')
    await expect(periodLabel).toHaveText(initialLabel!)
  })

  test('swipe left navigates to next month', async ({ page }) => {
    await expect(
      page.locator('.sx__month-grid-event, .sx__month-agenda-event').first(),
    ).toBeVisible({ timeout: 10_000 })
    const periodLabel = page.locator('.periodLabel')
    const initialLabel = await periodLabel.textContent()

    // Swipe left (dx < -50) → next month
    await page.evaluate(() => {
      const el = document.querySelector('.cal-wrapper')!
      el.dispatchEvent(
        new TouchEvent('touchstart', {
          changedTouches: [new Touch({ identifier: 0, target: el, clientX: 300, clientY: 300 })],
        }),
      )
      el.dispatchEvent(
        new TouchEvent('touchend', {
          changedTouches: [new Touch({ identifier: 0, target: el, clientX: 100, clientY: 300 })],
        }),
      )
    })

    await expect(periodLabel).not.toHaveText(initialLabel!)
  })

  test('swipe right navigates to previous month', async ({ page }) => {
    await expect(
      page.locator('.sx__month-grid-event, .sx__month-agenda-event').first(),
    ).toBeVisible({ timeout: 10_000 })
    const periodLabel = page.locator('.periodLabel')
    const initialLabel = await periodLabel.textContent()

    // Swipe right (dx > 50) → previous month
    await page.evaluate(() => {
      const el = document.querySelector('.cal-wrapper')!
      el.dispatchEvent(
        new TouchEvent('touchstart', {
          changedTouches: [new Touch({ identifier: 0, target: el, clientX: 100, clientY: 300 })],
        }),
      )
      el.dispatchEvent(
        new TouchEvent('touchend', {
          changedTouches: [new Touch({ identifier: 0, target: el, clientX: 300, clientY: 300 })],
        }),
      )
    })

    await expect(periodLabel).not.toHaveText(initialLabel!)
  })
})
