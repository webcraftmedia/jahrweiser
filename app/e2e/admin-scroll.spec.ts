import { test, expect } from '@playwright/test'

import { loginAs, ADMIN_USER, mockAdminEndpoints } from './helpers/api-mocks'

/**
 * One scrollbar, not two.
 *
 * The admin area used to nest a fixed-height pane with its own `overflow-auto`
 * inside the layout's scrolling `.content`: two scrollbars side by side, and a
 * stretch of empty page below short content because the inner box was the
 * viewport's height whatever was in it.
 */
test.describe('Admin layout', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_USER)
    await mockAdminEndpoints(page)
  })

  test('scrolls in one place only', async ({ page }) => {
    await page.locator('#navbar-desktop').getByRole('link', { name: 'Admin' }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByText('Mitglieder', { exact: false }).first()).toBeVisible()

    const scrollingPanes = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>('*')].filter((el) => {
          const style = getComputedStyle(el)
          return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1
        }).length,
    )

    expect(scrollingPanes).toBeLessThanOrEqual(1)
  })
})
