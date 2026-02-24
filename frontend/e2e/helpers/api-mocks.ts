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

export const MOCK_EVENT_DETAIL = {
  summary: 'Jahresversammlung',
  description: 'Jährliche Mitgliederversammlung\nAlle Mitglieder sind eingeladen',
  location: 'Vereinsheim',
  duration: 'PT2H',
  startDate: today.toISOString().slice(0, 19),
  endDate: new Date(today.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 19),
  uid: 'event-1',
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

  await page.route('**/api/event', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_EVENT_DETAIL),
    }),
  )
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
