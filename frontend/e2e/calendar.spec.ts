import { test, expect } from '@playwright/test'
import { loginAs, DEFAULT_USER, MOCK_EVENT_DETAIL } from './helpers/api-mocks'

test.describe('Calendar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
  })

  test('displays events in calendar', async ({ page }) => {
    await expect(page.locator('.cv-item').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Jahresversammlung').first()).toBeVisible()
  })

  test('clicking event opens modal with details', async ({ page }) => {
    await page.locator('.cv-item').first().click()

    const modal = page.locator('#default-modal')
    await expect(modal).toBeVisible()
    await expect(modal.getByText(MOCK_EVENT_DETAIL.summary)).toBeVisible()
    await expect(modal.getByText(MOCK_EVENT_DETAIL.location)).toBeVisible()
  })

  test('modal can be closed', async ({ page }) => {
    await page.locator('.cv-item').first().click()

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
    await expect(navbar.getByText('Logout')).toBeVisible()
  })
})
