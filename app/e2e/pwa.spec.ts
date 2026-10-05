import { devices, expect, test } from '@playwright/test'

import { DEFAULT_USER, loginAs, waitForHydration } from './helpers/api-mocks'

import type { Page } from '@playwright/test'

/**
 * The three ways the app is used, each with its own code (docu/pwa.md):
 * desktop browser (nothing), phone browser (manifest + install hint, no
 * service worker), installed app (service worker with the offline page).
 *
 * Runs against the production build the mock suite always uses — the only
 * place a service worker exists.
 */

/** A phone, minus Playwright's choice of browser engine. */
function phone(device: (typeof devices)[string]) {
  const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = device
  return { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch }
}

const manifestLink = (page: Page) => page.locator('link[rel="manifest"]')

async function registrations(page: Page) {
  return page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)
}

test.describe('PWA: desktop browser', () => {
  test('gets no manifest and no service worker', async ({ page }) => {
    await page.goto('/login')
    await waitForHydration(page)
    await expect(manifestLink(page)).toHaveCount(0)
    expect(await registrations(page)).toBe(0)
  })
})

test.describe('PWA: phone browser', () => {
  test.use(phone(devices['Pixel 7']))

  test('gets the manifest but no service worker', async ({ page }) => {
    await page.goto('/login')
    await waitForHydration(page)
    await expect(manifestLink(page)).toHaveAttribute('href', '/manifest.webmanifest')
    // Past the `load` event, when an installed app would have registered.
    await page.waitForLoadState('load')
    expect(await registrations(page)).toBe(0)
  })

  test('serves a manifest that makes the app installable', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.headers()['cache-control']).toBe('no-cache')
    const manifest = (await response.json()) as {
      name: string
      start_url: string
      display: string
      icons: { src: string; sizes: string; purpose: string }[]
    }
    expect(manifest.name).toBe('Jahrweiser')
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`)).toStrictEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ])
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).status()).toBe(200)
    }
  })
})

test.describe('PWA: install hint on an iPhone', () => {
  test.use(phone(devices['iPhone 13']))

  test('explains the share sheet and stays away once dismissed', async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
    const hint = page.getByRole('complementary', { name: 'Jahrweiser als App' })
    await expect(hint).toContainText('„Zum Home-Bildschirm“')

    await hint.getByRole('button', { name: 'Hinweis ausblenden' }).click()
    await expect(hint).toHaveCount(0)

    // A new page load (the session is mocked client-side only, so a plain
    // reload would land on the login page): still dismissed.
    await loginAs(page, DEFAULT_USER)
    await expect(page.getByRole('navigation', { name: 'Hauptnavigation' }).first()).toBeVisible()
    await expect(hint).toHaveCount(0)
    // Dismissed once of three times; back after the pause (useInstallHint).
    const stored = await page.evaluate(() =>
      localStorage.getItem('jahrweiser-install-hint-dismissed'),
    )
    expect(JSON.parse(stored!)).toMatchObject({ count: 1 })

    // The way back: "Als App installieren" in the menu shows the steps again.
    await page.locator('[aria-controls="navbar-mobile"]').click()
    await page
      .locator('#navbar-mobile')
      .getByRole('button', { name: 'Als App installieren' })
      .click()
    await expect(hint).toContainText('„Zum Home-Bildschirm“')
  })
})

test.describe('PWA: installed app', () => {
  test.use(phone(devices['Pixel 7']))

  test.beforeEach(async ({ page }) => {
    // What iOS reports for an app started from the home screen; Chromium has
    // no way to emulate `display-mode: standalone`.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true })
    })
  })

  test('registers the worker, caches no page, and shows the offline notice', async ({
    page,
    context,
  }) => {
    await page.goto('/login')
    await waitForHydration(page)
    await expect(manifestLink(page)).toHaveCount(1)
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

    // Precached: bundles, icons, the offline page — and not one document.
    const cached = await page.evaluate(async () => {
      const urls: string[] = []
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) {
          urls.push(new URL(request.url).pathname)
        }
      }
      return urls
    })
    expect(cached).toContain('/offline.html')
    expect(cached.some((url) => url.startsWith('/_nuxt/'))).toBe(true)
    expect(cached.filter((url) => !/\.[a-z0-9]+$/.test(url))).toStrictEqual([])
    expect(cached.filter((url) => url.startsWith('/api/'))).toStrictEqual([])

    await context.setOffline(true)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Du bist offline' })).toBeVisible()
    // The address stays the member's, so "Erneut versuchen" reloads that page.
    expect(new URL(page.url()).pathname).toBe('/')

    // /api is never answered by the worker, not even with the notice.
    await expect(page.goto('/api/blaettchen')).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/)
  })
})
