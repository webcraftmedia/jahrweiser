import { expect, test } from '@playwright/test'

import { triggerSync } from './helpers/dav'
import { closeDb, readMetricsDay, restoreMetricsDay, setLastSeen } from './helpers/db'
import { deleteAllMail, preparePage } from './helpers/maildev'
import { loginViaMagicLink } from './helpers/session'
import { runSeedDemo, runSeedReset } from './helpers/stack'

import type { MetricsDayRow } from './helpers/db'

/**
 * "Last active", end to end: sessions in MariaDB → `MAX(last_seen_at)` per
 * member → spans on the dashboard and in the members' list, and the 1/7/30-day
 * counts in the daily snapshot. The unit tests mock the database, so the parts
 * only a real one can answer live here: the aggregate over the LEFT JOIN, the
 * datetime coming back from the driver, and the migrated columns accepting
 * the snapshot.
 */

const ADMIN = 'admin@example.com'
const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
// carol@example.com never gets a session — the "never signed in" span.

const DAY_MS = 24 * 60 * 60 * 1000
const TODAY = new Date().toISOString().slice(0, 10)

let stashedDay: MetricsDayRow | null = null

test.beforeAll(async () => {
  runSeedReset()
  runSeedDemo()
  stashedDay = await readMetricsDay(TODAY)
  // Alice was here three days ago, Bob two months ago; the admin will be
  // "today" by logging in below.
  await setLastSeen(ALICE, new Date(Date.now() - 3 * DAY_MS))
  await setLastSeen(BOB, new Date(Date.now() - 60 * DAY_MS))
})

test.afterAll(async () => {
  await restoreMetricsDay(TODAY, stashedDay)
  await closeDb()
})

test.beforeEach(async () => {
  await deleteAllMail()
})

test.describe('admin: member activity', () => {
  test('counts the members into spans and draws them on the dashboard', async ({ page }) => {
    await loginViaMagicLink(page, ADMIN)

    const response = await page.request.get('/api/admin/metrics')
    expect(response.ok()).toBe(true)
    const body = (await response.json()) as {
      activity: Record<string, number>
      months: { active30d: number | null }[]
    }
    expect(body.activity).toStrictEqual({
      day: 1,
      week: 1,
      month: 0,
      quarter: 1,
      older: 0,
      never: 1,
    })
    // The running month is counted live: admin and Alice.
    expect(body.months.at(-1)!.active30d).toBe(2)

    await page.goto('/admin')
    await preparePage(page)
    await expect(page.getByRole('heading', { name: 'Zuletzt aktiv' })).toBeVisible()
    // Scoped to the drawing — the screen-reader table carries the same label.
    const bars = page.getByRole('img', { name: 'Zuletzt aktiv' })
    await expect(bars.getByText('Nie angemeldet', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Aktive Mitglieder' })).toBeVisible()
  })

  test('shows the span in the members’ list and never the moment', async ({ page }) => {
    await loginViaMagicLink(page, ADMIN)

    const response = await page.request.get('/api/admin/members/list')
    expect(response.ok()).toBe(true)
    const raw = await response.text()
    const { members } = JSON.parse(raw) as {
      members: { email: string; lastSeen: string }[]
    }
    const byMask = Object.fromEntries(members.map((member) => [member.email, member.lastSeen]))
    expect(byMask).toMatchObject({
      'ad•••@ex•••.com': 'day',
      'al•••@ex•••.com': 'week',
      'bo•••@ex•••.com': 'quarter',
      'ca•••@ex•••.com': 'never',
    })
    // No timestamp of anybody's last visit on the wire.
    expect(raw).not.toContain('lastSeenAt')

    await page.goto('/admin/members')
    await preparePage(page)
    const alice = page.getByRole('row').filter({ hasText: 'al•••@ex•••.com' })
    await expect(alice).toContainText('2 bis 7 Tage')
  })

  test('the sync records the 1/7/30-day counts in today’s snapshot', async ({ page }) => {
    // A login first, so "today" has somebody in it.
    await loginViaMagicLink(page, ADMIN)
    await triggerSync()
    expect(await readMetricsDay(TODAY)).toMatchObject({
      active_1d: 1,
      active_7d: 2,
      active_30d: 2,
    })
  })
})
