import { test, expect } from '@playwright/test'

import { loginAs, ADMIN_USER, mockAdminEndpoints, waitForHydration } from './helpers/api-mocks'

// The 401 handling hangs off a `$fetch` instance the app resolves per call
// (src/composables/useApi.ts). Whether that instance really reaches a call site
// is invisible to a unit test: the plugin's own spec stays green as long as the
// plugin builds a client, even if every page fetches through a different one
// without the handler. Nuxt 4.5 caused exactly that — so this asserts the
// behaviour where it is observable, in a browser.
test.describe('Session expiry', () => {
  test('sends a request that comes back 401 to the login page', async ({ page }) => {
    await loginAs(page, ADMIN_USER)
    await mockAdminEndpoints(page)
    await waitForHydration(page)

    // The session expires while the page is open. Registered last, so it wins
    // over the 200 from mockAdminEndpoints.
    await page.route('**/api/admin/metrics', async (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 401, message: 'Unauthorized' }),
      }),
    )

    await page.locator('#navbar-desktop').getByRole('link', { name: 'Admin' }).click()

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    // …and back to where the user was heading once they are logged in again.
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/admin')
  })
})
