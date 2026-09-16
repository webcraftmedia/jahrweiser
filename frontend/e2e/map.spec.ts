import { expect, test } from '@playwright/test'

import {
  DEFAULT_USER,
  loginAs,
  mockCalendarEndpoints,
  mockMapEndpoints,
  navigateClientSide,
  railLink,
} from './helpers/api-mocks'

test.describe('Karte', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
    await mockCalendarEndpoints(page)
  })

  test('is reachable from the icon rail and draws the members', async ({ page }) => {
    await mockMapEndpoints(page)
    await navigateClientSide(page, '/')

    await railLink(page, '/karte').click()
    await expect(page).toHaveURL(/\/karte$/)

    // One shape per postal code, and the numbers on top of them.
    await expect(page.locator('.areas path')).toHaveCount(2)
    await expect(page.getByText('7', { exact: true }).first()).toBeVisible()
    // The same numbers again, for readers who never see the map.
    await expect(page.locator('table')).toContainText('Zwingenberg')
  })

  test('opens on what the members cover, and zooms from there', async ({ page }) => {
    await mockMapEndpoints(page)
    await navigateClientSide(page, '/karte')

    const svg = page.locator('svg[role="img"]')
    const opened = await svg.getAttribute('viewBox')
    // Fitted to the two areas, not the whole country.
    expect(Number(opened?.split(' ')[2])).toBeLessThan(4000)

    await page.getByRole('button', { name: 'Karte vergrößern' }).click()
    await expect
      .poll(async () => Number((await svg.getAttribute('viewBox'))?.split(' ')[2]))
      .toBeLessThan(Number(opened?.split(' ')[2]))
  })

  test('hands the orientation down the ladder as it is zoomed in', async ({ page }) => {
    // Zoomed out, the Bundesland is what says where this is; zoomed in, the
    // Kreis takes over. Neither is a switch the reader has to find.
    await mockMapEndpoints(page)
    await navigateClientSide(page, '/karte')

    // Asserted by its path rather than by visibility: a border is a stroke on
    // a shape of no area, which Playwright reads as hidden.
    await expect(page.locator('.map-state')).toHaveAttribute('d', /^M/)
    await expect(page.locator('.state-names text')).toHaveText('HESSEN')

    // Six presses, not four: the staging measures how much of the country is
    // on screen (see `span` in MemberMap.vue), and this window is wider than
    // the map's own proportions, so it shows about half as much again as the
    // requested view — which the Kreis names wait out.
    const zoomIn = page.getByRole('button', { name: 'Karte vergrößern' })
    for (let i = 0; i < 6; i++) await zoomIn.click()

    await expect(page.locator('.district-names text')).toHaveText('Kreis Bergstraße')
  })

  test('writes the names of the places it has room for', async ({ page }) => {
    await mockMapEndpoints(page)
    await navigateClientSide(page, '/karte')
    await expect(page.locator('.places text').first()).toBeVisible()
  })

  test('fits the page instead of scrolling it', async ({ page }) => {
    // The map is meant to be zoomed, not scrolled past.
    await mockMapEndpoints(page)
    await navigateClientSide(page, '/karte')
    await expect(page.locator('.areas path')).toHaveCount(2)
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const el = document.querySelector('.content')
          return el ? el.scrollHeight - el.clientHeight : -1
        }),
      )
      .toBe(0)
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 667 }, hasTouch: true })

    test('zooms by pinching, not only by the buttons', async ({ page }) => {
      // `touch-action: none` keeps a drag across the map from scrolling the
      // page, and switches the browser's own pinch off with it — so the map
      // implements the gesture, and this is the only test that exercises it
      // through real touch events rather than synthesised pointer ones.
      await mockMapEndpoints(page)
      await navigateClientSide(page, '/karte')
      const svg = page.locator('svg[role="img"]')
      await expect(svg).toBeVisible()
      const width = async () => Number((await svg.getAttribute('viewBox'))!.split(' ')[2])
      const before = await width()

      const frame = (await svg.boundingBox())!
      const x = frame.x + frame.width / 2
      const y = frame.y + frame.height / 2
      const cdp = await page.context().newCDPSession(page)
      const touch = (gaps: number[], type: string) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: gaps.flatMap((gap, index) => [
            { x: x - gap, y, id: index * 2 },
            { x: x + gap, y, id: index * 2 + 1 },
          ]),
        })

      await touch([20], 'touchStart')
      for (const gap of [40, 70, 110]) {
        await touch([gap], 'touchMove')
        await page.waitForTimeout(50)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await expect.poll(width).toBeLessThan(before)
    })

    test('offers the sections in the burger menu as well as in the bar', async ({ page }) => {
      // The bottom bar is a row of unlabelled icons. Whoever does not read it
      // as navigation looks in the menu, and has to find the sections there.
      await mockMapEndpoints(page)
      await navigateClientSide(page, '/')

      await page.locator('[aria-controls="navbar-mobile"]').click()
      const menu = page.locator('#navbar-mobile')
      await expect(menu).toHaveClass(/menu-open/)
      for (const section of ['Kalender', 'Blättchen', 'Telegram-Kanäle', 'Karte']) {
        await expect(menu.getByRole('link', { name: section, exact: true })).toBeVisible()
      }

      await menu.getByRole('link', { name: 'Karte', exact: true }).click()
      await expect(page).toHaveURL(/\/karte$/)
      // Opening a section closes the menu behind it.
      await expect(menu).not.toHaveClass(/menu-open/)
    })

    test('marks the map in the menu too while the postal code is missing', async ({ page }) => {
      await mockMapEndpoints(page, { locked: true })
      await navigateClientSide(page, '/')

      await page.locator('[aria-controls="navbar-mobile"]').click()
      const entry = page.locator('#navbar-mobile a[href="/karte"]')
      await expect(entry.locator('.menu-warn')).toBeVisible()
      // The dot is decorative; the accessible name is what carries the state.
      await expect(entry).toHaveAttribute(
        'aria-label',
        'Karte — deine Postleitzahl fehlt oder ist ungültig',
      )
    })
  })

  test.describe('without a postal code', () => {
    test('marks the rail entry', async ({ page }) => {
      await mockMapEndpoints(page, { locked: true })
      await navigateClientSide(page, '/')
      await expect(railLink(page, '/karte').locator('.rail-warn')).toBeVisible()
    })

    test('shows a blurred preview and points at the settings', async ({ page }) => {
      await mockMapEndpoints(page, { locked: true })
      await navigateClientSide(page, '/karte')

      await expect(page.getByRole('heading', { name: 'Karte freischalten' })).toBeVisible()
      const cta = page.getByRole('link', { name: 'Postleitzahl hinterlegen' })
      await expect(cta).toBeVisible()

      // Nothing real is in the page — the preview is invented on the client.
      await expect(page.locator('body')).not.toContainText('Zwingenberg')
      await expect(page.locator('table')).toHaveCount(0)

      await cta.click()
      await expect(page).toHaveURL(/\/settings\/profile$/)
    })
  })
})
