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

  test('trims whitespace from email before sending the request', async ({ page }) => {
    // Autofill/copy-paste often append whitespace. Capture the actual request body
    // to prove the email is trimmed before it reaches the backend.
    let sentEmail: string | undefined
    await page.route('**/api/requestLoginLink', async (route) => {
      sentEmail = route.request().postDataJSON()?.email
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })
    await page.goto('/login')
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; }' })
    await waitForHydration(page)

    await page.locator('#email-address-icon').fill('  test@example.com  ')
    await page.getByRole('button', { name: 'Einloggen' }).click()

    await expect(page.getByText('Prüfe dein Postfach')).toBeVisible({ timeout: 10_000 })
    expect(sentEmail).toBe('test@example.com')
  })

  test('shows error feedback when the request fails', async ({ page }) => {
    await page.route('**/api/requestLoginLink', async (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 500, message: 'Failed to send login email' }),
      }),
    )
    await page.goto('/login')
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; }' })
    await waitForHydration(page)

    await page.locator('#email-address-icon').fill('test@example.com')
    await page.getByRole('button', { name: 'Einloggen' }).click()

    // Error hint shown, success message NOT shown, form stays usable
    await expect(page.getByText('Senden fehlgeschlagen.', { exact: false })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText('Prüfe dein Postfach')).toBeHidden()
    await expect(page.locator('#email-address-icon')).toBeVisible()
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
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}$/, { timeout: 15_000 })
    await expect(page.locator('#navbar-desktop').getByText('Willkommen')).toBeVisible()
  })

  test('valid token with redirect query navigates to deep-link target', async ({ page }) => {
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

    await page.goto('/login/valid-token-123?redirect=/2025/03')
    await expect(page).toHaveURL(/\/2025\/03$/, { timeout: 15_000 })
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
