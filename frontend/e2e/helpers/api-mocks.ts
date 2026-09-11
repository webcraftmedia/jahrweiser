import type { Page } from '@playwright/test'

export const DEFAULT_USER = { name: 'Test User', email: 'test@example.com', role: 'user' }
export const ADMIN_USER = { name: 'Admin User', email: 'admin@example.com', role: 'admin' }

export const MOCK_CALENDARS = [
  { name: 'Vereinskalender', color: '#3b82f6' },
  { name: 'Geburtstage', color: '#10b981' },
]

const today = new Date()
const tomorrow = new Date(today)
tomorrow.setDate(tomorrow.getDate() + 1)

export const MOCK_EVENTS = [
  {
    calendar: 'Vereinskalender',
    color: '#3b82f6',
    id: 'event-1',
    startDate: today.toISOString(),
    endDate: tomorrow.toISOString(),
    title: 'Jahresversammlung',
  },
  {
    calendar: 'Geburtstage',
    color: '#10b981',
    id: 'event-2',
    occurrence: 1,
    startDate: today.toISOString(),
    endDate: today.toISOString(),
    title: 'Geburtstag Max',
    isRecurring: true,
  },
]

export const MOCK_TELEGRAM_CHANNELS = [
  { name: 'Vereinskanal', description: 'Alle Infos', url: 'https://t.me/verein', public: true },
]

export const MOCK_BLAETTCHEN = {
  issues: [{ number: 12, date: '2026-05-01', file: '12_2026-05-01.pdf' }],
  contact: 'redaktion@example.com',
}

/** A square country and two postal codes — enough to draw and to assert on. */
export const MOCK_MAP_OUTLINE = { viewBox: '0 0 4000 5000', d: 'M0 0l4000 0 0 5000-4000 0z' }
export const MOCK_MAP = {
  areas: [
    {
      plz: '64673',
      ort: 'Zwingenberg',
      count: 3,
      d: 'M0 0l99 0 0 99z',
      cx: 500,
      cy: 500,
      size: 900,
    },
    { plz: '10115', ort: 'Berlin', count: 7, d: 'M0 0l9 0 0 9z', cx: 2900, cy: 900, size: 9 },
  ],
  unlocated: 0,
  located: 10,
  total: 14,
  max: 7,
}

export const MOCK_PLACES = [
  { name: 'Zwingenberg', x: 500, y: 500, rank: 7291 },
  { name: 'Bensheim', x: 2900, y: 900, rank: 40000 },
]

export const MOCK_EVENT_DETAIL = {
  summary: 'Jahresversammlung',
  description: 'Jährliche Mitgliederversammlung\nAlle Mitglieder sind eingeladen',
  location: 'Vereinsheim',
  duration: 'PT2H',
  startDate: today.toISOString().slice(0, 19),
  endDate: new Date(today.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 19),
  uid: 'event-1',
}

export const MOCK_METRICS = {
  current: {
    members: 42,
    newsletterSubscribed: 37,
    newsletterUnsubscribed: 5,
    telegramChannels: 4,
    blaettchenIssues: 12,
  },
  months: Array.from({ length: 12 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, '0')}`,
    members: 30 + index,
    derived: index < 10,
    newsletterSubscribed: 25 + index,
    newsletterUnsubscribed: index,
  })),
}

export const MOCK_TAGS = [
  { name: 'Vereinskalender', state: true },
  { name: 'Geburtstage', state: false },
  { name: 'Vorstand', state: true },
]

export async function mockCalendarEndpoints(page: Page) {
  await page.route('**/api/calendars', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CALENDARS),
    }),
  )

  await page.route('**/api/calendar', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_EVENTS),
    }),
  )

  // The icon rail requests these three on every page of the default layout.
  // Unmocked they would 401 against the real server, and
  // src/plugins/auth-redirect.ts turns any 401 into a logout — which empties
  // the page mid-test.
  await page.route('**/api/telegram-channels', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TELEGRAM_CHANNELS),
    }),
  )

  await page.route('**/api/blaettchen', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_BLAETTCHEN),
    }),
  )

  await page.route('**/api/map/status', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasPostalCode: true }),
    }),
  )

  await page.route('**/api/event', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_EVENT_DETAIL),
    }),
  )
}

/**
 * The map page's own two requests. `locked` mocks the 403 a member without a
 * postal code gets — the server sends no aggregate at all in that case, so
 * neither does this.
 */
export async function mockMapEndpoints(page: Page, { locked = false } = {}) {
  await page.route('**/api/map/outline', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_MAP_OUTLINE),
    }),
  )

  await page.route('**/api/map/status', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasPostalCode: !locked }),
    }),
  )

  await page.route('**/api/map/members', async (route) =>
    route.fulfill({
      status: locked ? 403 : 200,
      contentType: 'application/json',
      body: JSON.stringify(locked ? { statusMessage: 'postal-code-required' } : MOCK_MAP),
    }),
  )

  await page.route('**/api/map/places*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(locked ? [] : MOCK_PLACES),
    }),
  )
}

/**
 * The profile form's endpoints: the stored profile, the postal-code lookup it
 * checks against while typing, and the save.
 *
 * The lookup answers for `KNOWN_POSTAL_CODES` and refuses everything else —
 * which is the map's own rule, reduced to what a test needs. `saveFails` mocks
 * the 400 the endpoint answers for a code it will not store.
 */
export const KNOWN_POSTAL_CODES: Record<string, string> = {
  '64673': 'Zwingenberg',
  '64625': 'Bensheim',
}

export async function mockProfileEndpoints(
  page: Page,
  { postalCode = '', saveFails = false } = {},
) {
  await page.route('**/api/me/profile', async (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: saveFails ? 400 : 200,
        contentType: 'application/json',
        body: JSON.stringify(saveFails ? { statusMessage: 'invalid-postal-code' } : {}),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ firstName: 'Test', lastName: 'User', postalCode }),
    })
  })

  await page.route('**/api/map/postal-code*', async (route) => {
    const plz = new URL(route.request().url()).searchParams.get('plz') ?? ''
    const ort = KNOWN_POSTAL_CODES[plz]
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ known: Boolean(ort), plz: ort ? plz : null, ort: ort ?? null }),
    })
  })
}

export async function loginAs(page: Page, user: typeof DEFAULT_USER) {
  // Mock session endpoint — returns authenticated user
  await page.route('**/api/_auth/session', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user, loggedInAt: new Date().toISOString() }),
    }),
  )

  // Mock token redemption
  await page.route('**/api/redeemLoginLink', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    }),
  )

  // Mock calendar endpoints so the index page can load
  await mockCalendarEndpoints(page)

  // Navigate to login with a test token — triggers onMounted flow
  await page.goto('/login/test-token')

  // Wait for redirect to home page
  await page.waitForURL('/', { timeout: 15_000 })
}

export async function mockAdminEndpoints(page: Page) {
  // /admin is the overview now; it asks for this on mount, and an unmocked 401
  // would log the user out through src/plugins/auth-redirect.ts mid-test.
  await page.route('**/api/admin/metrics', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_METRICS),
    }),
  )

  await page.route('**/api/admin/getUserTags', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TAGS),
    }),
  )

  await page.route('**/api/admin/updateUserTags', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(true),
    }),
  )
}

/**
 * A section entry in the icon rail.
 *
 * Scoped by the rail's own landmark on purpose: the burger menu lists the same
 * sections with the same `href`, so a bare `nav a[href="/karte"]` matches the
 * menu entry first — and that one is hidden until the menu is opened. The rail
 * itself is rendered twice (desktop and mobile), hence the `.first()`.
 */
export function railLink(page: Page, href: string) {
  return page.locator(`nav[aria-label="Hauptnavigation"] a[href="${href}"]`).first()
}

export async function navigateClientSide(page: Page, path: string) {
  await page.evaluate((p) => {
    const el = document.getElementById('__nuxt')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const router = (el as any)?.__vue_app__?.config?.globalProperties?.$router
    router?.push(p)
  }, path)
}

export async function mockRequestLoginLink(page: Page) {
  await page.route('**/api/requestLoginLink', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    }),
  )
}

/** Wait for Nuxt/Vue to fully hydrate the page and attach event handlers */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const nuxt = document.getElementById('__nuxt')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(nuxt as any)?.__vue_app__) return false
    // Check that Vue has processed DOM elements (hydration markers removed)
    return !document.querySelector('[data-server-rendered]')
  })
  // Allow time for component event handlers to fully attach
  await page.waitForTimeout(200)
}
