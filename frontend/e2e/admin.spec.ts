import { test, expect } from '@playwright/test'

import { loginAs, ADMIN_USER, mockAdminEndpoints } from './helpers/api-mocks'

test.describe('Admin', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_USER)
    await mockAdminEndpoints(page)
  })

  test('admin link is visible for admin users', async ({ page }) => {
    const navbar = page.locator('#navbar-desktop')
    await expect(navbar.getByText('Admin')).toBeVisible()
  })

  test('navigates to admin members add page', async ({ page }) => {
    await page.locator('#navbar-desktop').getByText('Admin').click()
    await expect(page).toHaveURL(/\/admin\/members\/add/)
    await expect(page.getByText('Schritt 1')).toBeVisible()
  })

  test('completes full wizard flow', async ({ page }) => {
    await page.locator('#navbar-desktop').getByText('Admin').click()
    await page.waitForURL(/\/admin\/members\/add/)

    // Step 1: Enter email
    await page.locator('#email').fill('member@example.com')
    await page.getByRole('button', { name: 'Weiter' }).first().click()

    // Step 2: Tags loaded, click next
    await expect(page.getByText('Schritt 2')).toBeVisible()
    await page.getByRole('button', { name: 'Weiter' }).click()

    // Step 3: Submit
    await expect(page.getByText('Schritt 3')).toBeVisible()
    await page.getByRole('button', { name: 'Mitglied hinzufügen' }).click()

    // Result: success
    await expect(page.getByText('Das war erfolgreich!')).toBeVisible()
  })

  test('shows error on submit failure', async ({ page }) => {
    // Override updateUserTags to return error
    await page.route('**/api/admin/updateUserTags', async (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 500, message: 'Internal Server Error' }),
      }),
    )

    await page.locator('#navbar-desktop').getByText('Admin').click()
    await page.waitForURL(/\/admin\/members\/add/)

    // Step 1
    await page.locator('#email').fill('member@example.com')
    await page.getByRole('button', { name: 'Weiter' }).first().click()

    // Step 2
    await page.getByRole('button', { name: 'Weiter' }).click()

    // Step 3
    await page.getByRole('button', { name: 'Mitglied hinzufügen' }).click()

    await expect(page.getByText('Fehler aufgetreten')).toBeVisible()
  })

  test('step navigation back works', async ({ page }) => {
    await page.locator('#navbar-desktop').getByText('Admin').click()
    await page.waitForURL(/\/admin\/members\/add/)

    // Step 1
    await page.locator('#email').fill('member@example.com')
    await page.getByRole('button', { name: 'Weiter' }).first().click()

    // Step 2 visible
    await expect(page.getByText('Schritt 2')).toBeVisible()

    // Go back to step 1
    await page.getByRole('button', { name: 'Bearbeiten' }).click()

    // Email input should be enabled again
    const emailInput = page.locator('#email')
    await expect(emailInput).toBeEnabled()
  })
})
