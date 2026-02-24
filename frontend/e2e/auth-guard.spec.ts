import { test, expect } from '@playwright/test'

import { loginAs, navigateClientSide, DEFAULT_USER } from './helpers/api-mocks'

test.describe('Auth Guard', () => {
  test('redirects / to /login when not authenticated', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('redirects /admin to /login when not authenticated', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('redirects non-admin from /admin to /', async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
    // Use client-side navigation to keep mocked session state
    await navigateClientSide(page, '/admin')
    await expect(page).toHaveURL('/')
  })

  test('hides admin link for non-admin users', async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
    const navbar = page.locator('#navbar-desktop')
    await expect(navbar).toBeVisible()
    await expect(navbar).not.toContainText('Admin')
  })

  test('logout redirects to /login', async ({ page }) => {
    await loginAs(page, DEFAULT_USER)

    // Override session mock: DELETE clears, subsequent GETs return empty
    await page.route('**/api/_auth/session', async (route) => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.locator('#navbar-desktop').getByText('Ausloggen').click()
    await expect(page).toHaveURL(/\/login/)
  })
})
