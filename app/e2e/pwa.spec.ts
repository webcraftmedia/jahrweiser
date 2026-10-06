import { devices, expect, test } from '@playwright/test'

import {
  DEFAULT_USER,
  MOCK_CALENDARS,
  MOCK_EVENT_DETAIL,
  MOCK_EVENTS,
  loginAs,
  waitForHydration,
} from './helpers/api-mocks'

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
    // The mark tells a start from the home screen apart (rememberAppLaunch).
    expect(manifest.start_url).toBe('/?app')
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

test.describe('PWA: manifest in the server-rendered page', () => {
  // Firefox and Safari look for it once, at load; added later by script, they
  // never see it and offer only a shortcut to the open page.
  const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0'

  test('is in the HTML for a phone, not for a desktop', async ({ request }) => {
    const onPhone = await (
      await request.get('/login', { headers: { 'user-agent': FIREFOX_ANDROID } })
    ).text()
    expect(onPhone).toMatch(/<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest"/)
    expect(onPhone).toMatch(/<link[^>]+rel="icon"[^>]+sizes="192x192"/)

    const onDesktop = await (await request.get('/login')).text()
    expect(onDesktop).not.toContain('rel="manifest"')
  })
})

test.describe('PWA: Firefox on Android', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  })

  test('is never sent to make a shortcut', async ({ page }) => {
    // What Firefox lacks: the install event Chromium has.
    await page.addInitScript(() => {
      let owner: object | null = window
      while (owner && !Object.prototype.hasOwnProperty.call(owner, 'onbeforeinstallprompt')) {
        owner = Object.getPrototypeOf(owner) as object | null
      }
      if (owner) Reflect.deleteProperty(owner, 'onbeforeinstallprompt')
    })
    await loginAs(page, DEFAULT_USER)
    await expect(page.getByRole('navigation', { name: 'Hauptnavigation' }).first()).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Jahrweiser als App' })).toHaveCount(0)
    await page.locator('[aria-controls="navbar-mobile"]').click()
    await expect(
      page.locator('#navbar-mobile').getByRole('button', { name: 'Als App installieren' }),
    ).toHaveCount(0)
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
    // The mocks would still answer: route handlers run before the network.
    for (const path of ['**/api/calendars', '**/api/calendar', '**/api/event']) {
      await page.route(path, async (route) => route.abort('internetdisconnected'))
    }
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Du bist offline' })).toBeVisible()
    // The address stays the member's, so "Erneut versuchen" reloads that page.
    expect(new URL(page.url()).pathname).toBe('/')

    // An offline start on any calendar address — the one open last, an event —
    // gets the stored start page when that very address was never stored.
    await context.setOffline(false)
    // The offline page reloads itself once the network is back; settle first.
    await page.goto('/login')
    await waitForHydration(page)
    await page.evaluate(async () => {
      const pages = await caches.open('jahrweiser-pages')
      await pages.put(
        '/?app',
        new Response('<!doctype html><title>start</title><h1>Gespeicherte Startseite</h1>', {
          headers: { 'content-type': 'text/html' },
        }),
      )
    })
    await context.setOffline(true)
    await page.goto('/2026/11')
    await expect(page.getByRole('heading', { name: 'Gespeicherte Startseite' })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/2026/11')
    // Not for other pages: those keep the offline notice.
    await page.goto('/karte')
    await expect(page.getByRole('heading', { name: 'Du bist offline' })).toBeVisible()

    // /api is never answered by the worker, not even with the notice.
    await expect(page.goto('/api/blaettchen')).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/)
  })
})

test.describe('PWA: installed app, calendar offline', () => {
  test.use(phone(devices['Pixel 7']))

  /** A member as the server knows them — the offline copy is kept per uid. */
  const MEMBER = { ...DEFAULT_USER, uid: 'u-offline' }
  /** What the server sends with every authenticated answer (shared/session.ts). */
  const SESSION_HEADER = { 'X-Session-Expires-In': '3600' }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true })
    })
  })

  async function storedKeys(page: Page) {
    return page.evaluate(
      async () =>
        new Promise<string[]>((resolve) => {
          const open = indexedDB.open('jahrweiser-offline')
          open.addEventListener('success', () => {
            const db = open.result
            if (!db.objectStoreNames.contains('entries')) {
              db.close()
              resolve([])
              return
            }
            const req = db.transaction('entries').objectStore('entries').getAllKeys()
            req.addEventListener('success', () => {
              db.close()
              resolve(req.result.map(String))
            })
          })
        }),
    )
  }

  test('shows the kept calendar offline and forgets it on logout', async ({ page, context }) => {
    await loginAs(page, MEMBER)
    // Registered last, so they answer before the mocks from loginAs().
    await page.route('**/api/_auth/session', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: MEMBER, loggedInAt: new Date().toISOString() }),
      }),
    )
    await page.route('**/api/calendars', async (route) =>
      route.fulfill({ status: 200, headers: SESSION_HEADER, json: MOCK_CALENDARS }),
    )
    await page.route('**/api/calendar', async (route) =>
      route.fulfill({ status: 200, headers: SESSION_HEADER, json: MOCK_EVENTS }),
    )

    // A month ahead and back, now with the header the real server sends: the
    // deadline exists from here on. (No reload — the mocked session lives in
    // the client only.)
    const today = page.locator('.cv-header-nav button').nth(2)
    const next = page.locator('.cv-header-nav button').last()
    await expect(page.getByText('Jahresversammlung').first()).toBeVisible()
    await next.click()
    await today.click()
    await expect.poll(() => storedKeys(page)).toContain('calendars')
    // The month after the shown one is fetched ahead.
    await expect
      .poll(async () => (await storedKeys(page)).filter((key) => key.startsWith('events:')).length)
      .toBeGreaterThanOrEqual(2 * MOCK_CALENDARS.length)
    expect(await page.evaluate(() => localStorage.getItem('jahrweiser-offline-session'))).toContain(
      'u-offline',
    )

    // An event opened online is kept with its details.
    const modal = page.locator('#default-modal')
    const firstEvent = page.locator('.sx__month-grid-event, .sx__list-event').first()
    await firstEvent.click()
    await expect(modal.getByText(MOCK_EVENT_DETAIL.location)).toBeVisible()
    await expect
      .poll(async () => (await storedKeys(page)).some((key) => key.startsWith('event:')))
      .toBe(true)
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()

    // Network gone (the mocks would still answer — route handlers run before
    // the network, so they are cut off as well). Opening the event again can
    // only be answered from the device, and the calendar says so.
    await context.setOffline(true)
    for (const path of ['**/api/calendars', '**/api/calendar', '**/api/event']) {
      await page.route(path, async (route) => route.abort('internetdisconnected'))
    }
    await firstEvent.click()
    await expect(modal.getByText(MOCK_EVENT_DETAIL.location)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toContainText(
      'du siehst den Stand vom',
    )

    // The bar stays under the header while the month scrolls beneath it.
    // A short window, so the two mock events are enough to scroll.
    await page.setViewportSize({ width: 412, height: 360 })
    const bar = page.getByRole('status').filter({ hasText: 'du siehst den Stand vom' })
    const before = (await bar.boundingBox())!.y
    const scrolled = await page.locator('.content').evaluate((el) => {
      el.scrollTop = el.scrollHeight
      return el.scrollTop
    })
    expect(scrolled).toBeGreaterThan(0)
    await page.waitForTimeout(300)
    expect(Math.abs((await bar.boundingBox())!.y - before)).toBeLessThan(2)
    await page.setViewportSize({ width: 412, height: 915 })

    // Back online, logging out leaves nothing of the member on the device.
    await context.setOffline(false)
    await page.route('**/api/_auth/session', async (route) =>
      route.fulfill({ status: 200, json: {} }),
    )
    await page.locator('[aria-controls="navbar-mobile"]').click()
    await page.locator('#navbar-mobile').getByRole('button', { name: 'Ausloggen' }).click()
    await page.waitForURL('**/login')
    await expect.poll(() => storedKeys(page)).toStrictEqual([])
    expect(await page.evaluate(() => localStorage.getItem('jahrweiser-offline-session'))).toBeNull()
    expect(await page.evaluate(async () => caches.has('jahrweiser-pages'))).toBe(false)
  })
})
