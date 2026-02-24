import { test, expect } from '@playwright/test'

import { mockRequestLoginLink, mockCalendarEndpoints, waitForHydration } from './helpers/api-mocks'

test.describe('Login Page', () => {
  test('shows login form with email input and submit button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#email-address-icon')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Einloggen' })).toBeVisible()
  })

  test('shows success message after email submission', async ({ page }) => {
    await mockRequestLoginLink(page)
    await page.goto('/login')
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; }' })
    await waitForHydration(page)

    await page.locator('#email-address-icon').fill('test@example.com')
    await page.getByRole('button', { name: 'Einloggen' }).click()

    await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })
  })

  test('dismiss button returns to login form', async ({ page }) => {
    await mockRequestLoginLink(page)
    await page.goto('/login')
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; }' })
    await waitForHydration(page)

    await page.locator('#email-address-icon').fill('test@example.com')
    await page.getByRole('button', { name: 'Einloggen' }).click()

    await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })

    // Button has aria-label="Close" but visible text is "Zurück zum Login"
    await page.getByText('Zurück zum Login').click()

    await expect(page.locator('#email-address-icon')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Einloggen' })).toBeVisible()
  })

  test('valid token redirects to home page', async ({ page }) => {
    await page.route('**/api/_auth/session', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { name: 'Test User', email: 'test@example.com', role: 'user' },
          loggedInAt: new Date().toISOString(),
        }),
      }),
    )
    await page.route('**/api/redeemLoginLink', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      }),
    )
    await mockCalendarEndpoints(page)

    await page.goto('/login/valid-token-123')
    await expect(page).toHaveURL('/', { timeout: 15_000 })
    await expect(page.locator('#navbar-desktop').getByText('Willkommen')).toBeVisible()
  })

  test('invalid token shows error message', async ({ page }) => {
    await page.route('**/api/redeemLoginLink', async (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 401, message: 'Bad credentials' }),
      }),
    )

    await page.goto('/login/invalid-token')

    await expect(page.getByText('Ein Fehler...')).toBeVisible()
  })
})
