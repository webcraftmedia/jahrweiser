// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { dbCalls, firstDbCall, mockDb, queueDbResults, resetDb } from '../../test/helpers/mock-db'

import { resetPlzAreaCache } from './memberMap'
import {
  buildMonthlySeries,
  collectCurrentMetrics,
  countBlaettchenIssues,
  countLocatable,
  countMembersWithPostalCode,
  countTelegramChannels,
  deriveMemberCounts,
  deriveNewsletterCounts,
  monthEnd,
  monthKeys,
  recordDailyMetrics,
  today,
} from './metrics'

import type { LoadedAreas } from './memberMap'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

/** A geometry that knows exactly one postal code. */
const GEOMETRY: LoadedAreas = {
  viewBox: '0 0 4000 5000',
  outline: 'M0 0l10 0 0 10z',
  areas: new Map([['64673', { o: 'Zwingenberg', d: 'M0 0l10 0 0 10z', c: [100, 200], s: 5000 }]]),
}

/** Serve (or withhold, with null) the geometry artefact `loadPlzAreas` reads. */
function storageServing(value: unknown): void {
  resetPlzAreaCache()
  vi.mocked(globalThis.useStorage).mockReturnValue({
    getItem: vi.fn().mockResolvedValue(value),
  })
}

const fs = vi.hoisted(() => ({ readdir: vi.fn() }))
vi.mock('node:fs/promises', () => fs)

const CONFIG = { BLAETTCHEN_DIR: 'data/blaettchen' }

function user(createdAt: string, deletedAt: string | null = null) {
  return {
    createdAt: new Date(createdAt),
    deletedAt: deletedAt ? new Date(deletedAt) : null,
    newsletterSubscribed: 'subscribed' as const,
    updatedAt: new Date(createdAt),
  }
}

/** Somebody who opted out; `updatedAt` is when that (probably) happened. */
function optedOut(createdAt: string, at: string, deletedAt: string | null = null) {
  return {
    ...user(createdAt, deletedAt),
    newsletterSubscribed: 'unsubscribed' as const,
    updatedAt: new Date(at),
  }
}

describe('monthKeys', () => {
  it('returns the last twelve months, oldest first, including the current one', () => {
    const keys = monthKeys(12, new Date('2026-09-09T12:00:00Z'))
    expect(keys).toHaveLength(12)
    expect(keys[0]).toBe('2025-10')
    expect(keys[11]).toBe('2026-09')
  })

  it('walks across the turn of the year', () => {
    expect(monthKeys(3, new Date('2026-01-15T00:00:00Z'))).toStrictEqual([
      '2025-11',
      '2025-12',
      '2026-01',
    ])
  })
})

describe('monthEnd', () => {
  it('is the first instant of the following month', () => {
    // Exclusive bound: an event at 23:59:59 on the last day still counts.
    expect(monthEnd('2026-09').toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('rolls into the next year for December', () => {
    expect(monthEnd('2026-12').toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})

describe('deriveMemberCounts', () => {
  const months = ['2026-01', '2026-02', '2026-03']

  it('counts everyone who had joined by the end of each month', () => {
    const rows = [user('2025-12-01'), user('2026-02-10'), user('2026-03-31T23:00:00Z')]
    expect(deriveMemberCounts(rows, months)).toStrictEqual([1, 2, 3])
  })

  it('drops a member again from the month they left', () => {
    const rows = [user('2025-12-01'), user('2025-12-01', '2026-02-15')]
    expect(deriveMemberCounts(rows, months)).toStrictEqual([2, 1, 1])
  })

  it('still counts someone who left later in the same month as the bound', () => {
    // Departure exactly at the bound belongs to the next month, not this one.
    const rows = [user('2025-12-01', '2026-03-01T00:00:00Z')]
    expect(deriveMemberCounts(rows, months)).toStrictEqual([1, 1, 0])
  })

  it('returns zeros for an empty sidecar', () => {
    expect(deriveMemberCounts([], months)).toStrictEqual([0, 0, 0])
  })
})

describe('deriveNewsletterCounts', () => {
  const months = ['2026-01', '2026-02', '2026-03']

  it('counts everyone as a subscriber until they opted out', () => {
    // A new account starts subscribed, so subscribers are simply everyone
    // present minus those who left the list.
    const rows = [user('2025-12-01'), optedOut('2025-12-01', '2026-02-10')]
    expect(deriveNewsletterCounts(rows, months)).toStrictEqual({
      subscribed: [2, 1, 1],
      unsubscribed: [0, 1, 1],
    })
  })

  it('counts an opt-out from its own month, not before', () => {
    const rows = [optedOut('2025-12-01', '2026-03-20')]
    expect(deriveNewsletterCounts(rows, months)).toStrictEqual({
      subscribed: [1, 1, 0],
      unsubscribed: [0, 0, 1],
    })
  })

  it('drops people who left the community from both series', () => {
    const rows = [user('2025-12-01', '2026-02-05'), optedOut('2025-12-01', '2026-01-05')]
    expect(deriveNewsletterCounts(rows, months)).toStrictEqual({
      subscribed: [1, 0, 0],
      unsubscribed: [1, 1, 1],
    })
  })

  it('ignores anyone who had not joined yet', () => {
    const rows = [optedOut('2026-02-20', '2026-02-25')]
    expect(deriveNewsletterCounts(rows, months)).toStrictEqual({
      subscribed: [0, 0, 0],
      unsubscribed: [0, 1, 1],
    })
  })

  it('returns zeroes for an empty sidecar', () => {
    expect(deriveNewsletterCounts([], months)).toStrictEqual({
      subscribed: [0, 0, 0],
      unsubscribed: [0, 0, 0],
    })
  })
})

describe('today', () => {
  it('formats the day the way the primary key stores it', () => {
    expect(today(new Date('2026-09-09T23:30:00Z'))).toBe('2026-09-09')
  })
})

describe('countTelegramChannels', () => {
  beforeEach(() => {
    resetDb()
    vi.clearAllMocks()
  })

  it('counts the rows of the channel table', async () => {
    // The list moved out of a JSON file into the sidecar; this tile followed it.
    queueDbResults([{ value: 4 }])
    await expect(countTelegramChannels()).resolves.toBe(4)
  })

  it('reports none while no channel exists', async () => {
    queueDbResults([])
    await expect(countTelegramChannels()).resolves.toBe(0)
  })
})

describe('countBlaettchenIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('counts only files that are actually issues', async () => {
    fs.readdir.mockResolvedValue(['11_2025-12-24.pdf', '12_2026-05-01.pdf', '.DS_Store', 'x.pdf'])
    await expect(countBlaettchenIssues('data/blaettchen')).resolves.toBe(2)
  })

  it('reports none when the directory does not exist yet', async () => {
    fs.readdir.mockRejectedValue(new Error('ENOENT'))
    await expect(countBlaettchenIssues('data/blaettchen')).resolves.toBe(0)
  })
})

describe('countLocatable', () => {
  it('counts only the codes the map can actually place', async () => {
    // 64673 is in the geometry, 99999 is five digits but unknown — somebody the
    // map cannot draw, so the dashboard must not claim them as covered.
    expect(
      countLocatable(
        [
          { postalCode: '64673', count: 3 },
          { postalCode: '99999', count: 2 },
        ],
        GEOMETRY,
      ),
    ).toBe(3)
  })

  it('counts the spellings of one code together', async () => {
    expect(
      countLocatable(
        [
          { postalCode: '64673', count: 1 },
          { postalCode: 'D-64673', count: 2 },
        ],
        GEOMETRY,
      ),
    ).toBe(3)
  })

  it('falls back to the format check when no geometry was built', async () => {
    // Without the artefact "unknown code" cannot be told from "known code" —
    // and silently reporting nobody would be the worse answer.
    expect(
      countLocatable(
        [
          { postalCode: '99999', count: 2 },
          { postalCode: 'CH-8001', count: 1 },
          { postalCode: null, count: 4 },
        ],
        null,
      ),
    ).toBe(2)
  })

  it('is zero while nobody has a code at all', async () => {
    expect(countLocatable([], GEOMETRY)).toBe(0)
  })
})

describe('countMembersWithPostalCode', () => {
  beforeEach(() => {
    resetDb()
    vi.clearAllMocks()
  })

  it('adds up the grouped rows through the geometry', async () => {
    storageServing({
      viewBox: GEOMETRY.viewBox,
      outline: GEOMETRY.outline,
      areas: Object.fromEntries(GEOMETRY.areas),
    })
    queueDbResults([
      { postalCode: '64673', count: 7 },
      { postalCode: '00000', count: 2 },
    ])
    await expect(countMembersWithPostalCode()).resolves.toBe(7)
  })

  it('groups instead of scanning — one lookup per code, not per member', async () => {
    storageServing(null)
    queueDbResults([{ postalCode: '64673', count: 7 }])
    await countMembersWithPostalCode()
    expect(dbCalls().some((call) => call.method === 'groupBy')).toBe(true)
  })
})

describe('collectCurrentMetrics', () => {
  beforeEach(() => {
    resetDb()
    vi.clearAllMocks()
    fs.readdir.mockResolvedValue([])
    storageServing(null)
  })

  it('converts the decimal strings MySQL returns for SUM()', async () => {
    queueDbResults(
      [{ members: '42', subscribed: '37', unsubscribed: '5' }],
      [{ value: 1 }],
      [{ postalCode: '64673', count: 29 }],
    )
    fs.readdir.mockResolvedValue(['12_2026-05-01.pdf'])
    await expect(collectCurrentMetrics(CONFIG)).resolves.toStrictEqual({
      members: 42,
      newsletterSubscribed: 37,
      newsletterUnsubscribed: 5,
      telegramChannels: 1,
      blaettchenIssues: 1,
      withPostalCode: 29,
    })
  })

  it('reads an empty sidecar as zeros rather than NaN', async () => {
    // SUM() over no rows is NULL, not 0.
    queueDbResults([{ members: null, subscribed: null, unsubscribed: null }], [{ value: 0 }], [])
    const metrics = await collectCurrentMetrics(CONFIG)
    expect(metrics.members).toBe(0)
    expect(metrics.newsletterSubscribed).toBe(0)
    expect(metrics.withPostalCode).toBe(0)
  })

  it('survives a query that returns no row at all', async () => {
    queueDbResults([], [], [])
    await expect(collectCurrentMetrics(CONFIG)).resolves.toMatchObject({ members: 0 })
  })
})

describe('recordDailyMetrics', () => {
  beforeEach(() => {
    resetDb()
    vi.clearAllMocks()
    fs.readdir.mockResolvedValue([])
    storageServing(null)
  })

  it('writes one row keyed by the day, overwriting an earlier run', async () => {
    // The cron hits the sync every ten minutes; without the upsert this would
    // be 144 rows a day instead of one.
    queueDbResults(
      [{ members: '4', subscribed: '3', unsubscribed: '1' }],
      [{ value: 0 }],
      [{ postalCode: '64673', count: 2 }],
    )
    await recordDailyMetrics(CONFIG, new Date('2026-09-09T08:00:00Z'))
    expect(firstDbCall('values')?.[0]).toStrictEqual({
      day: '2026-09-09',
      members: 4,
      newsletterSubscribed: 3,
      newsletterUnsubscribed: 1,
      telegramChannels: 0,
      blaettchenIssues: 0,
      withPostalCode: 2,
    })
    expect(dbCalls().some((call) => call.method === 'onDuplicateKeyUpdate')).toBe(true)
  })

  it('does not put the day into the update set — it is the key', async () => {
    queueDbResults([{ members: '4', subscribed: '3', unsubscribed: '1' }], [{ value: 0 }], [])
    await recordDailyMetrics(CONFIG, new Date('2026-09-09T08:00:00Z'))
    const upsert = dbCalls().find((call) => call.method === 'onDuplicateKeyUpdate')
    expect((upsert?.args[0] as { set: Record<string, unknown> }).set).not.toHaveProperty('day')
  })
})

describe('buildMonthlySeries', () => {
  const NOW = new Date('2026-09-09T12:00:00Z')

  beforeEach(() => {
    resetDb()
    vi.clearAllMocks()
  })

  it('returns twelve months, oldest first', async () => {
    queueDbResults([], [])
    const series = await buildMonthlySeries(NOW)
    expect(series).toHaveLength(12)
    expect(series[0]!.month).toBe('2025-10')
    expect(series[11]!.month).toBe('2026-09')
  })

  it('derives the member count for months nothing was measured in', async () => {
    queueDbResults([user('2025-09-01'), user('2026-08-01')], [])
    const series = await buildMonthlySeries(NOW)
    expect(series[0]).toMatchObject({ month: '2025-10', members: 1, derived: true })
    expect(series[11]).toMatchObject({ month: '2026-09', members: 2, derived: true })
  })

  it('reconstructs the newsletter split for months nothing was measured in', async () => {
    // From the current state plus `updated_at` — see deriveNewsletterCounts.
    queueDbResults([user('2025-09-01'), optedOut('2025-09-01', '2026-03-04')], [])
    const series = await buildMonthlySeries(NOW)
    expect(series[0]).toMatchObject({ newsletterSubscribed: 2, newsletterUnsubscribed: 0 })
    expect(series[11]).toMatchObject({ newsletterSubscribed: 1, newsletterUnsubscribed: 1 })
  })

  it('prefers a measurement over the derivation once one exists', async () => {
    queueDbResults(
      [user('2025-09-01')],
      [
        {
          day: '2026-09-08',
          members: 99,
          newsletterSubscribed: 80,
          newsletterUnsubscribed: 19,
          telegramChannels: 4,
          blaettchenIssues: 12,
          withPostalCode: 61,
        },
      ],
    )
    const series = await buildMonthlySeries(NOW)
    expect(series[11]).toMatchObject({
      month: '2026-09',
      members: 99,
      derived: false,
      newsletterSubscribed: 80,
      newsletterUnsubscribed: 19,
    })
    // The months before it stay derived — that is the dashed part of the line.
    expect(series[10]!.derived).toBe(true)
  })

  it('takes the last snapshot of a month as that month’s value', async () => {
    queueDbResults(
      [],
      [
        {
          day: '2026-09-01',
          members: 10,
          newsletterSubscribed: 9,
          newsletterUnsubscribed: 1,
          telegramChannels: 0,
          blaettchenIssues: 0,
          withPostalCode: 3,
        },
        {
          day: '2026-09-08',
          members: 12,
          newsletterSubscribed: 10,
          newsletterUnsubscribed: 2,
          telegramChannels: 0,
          blaettchenIssues: 0,
          withPostalCode: 5,
        },
      ],
    )
    const series = await buildMonthlySeries(NOW)
    expect(series[11]).toMatchObject({ members: 12, newsletterUnsubscribed: 2, withPostalCode: 5 })
  })

  it('leaves the postal-code figure empty for months nothing was measured in', async () => {
    // It is the one number with no derivation behind it: the column was
    // backfilled in one go, so `updated_at` cannot say when somebody entered
    // their code. A zero would read as "nobody had one", which is a claim.
    queueDbResults([user('2025-09-01')], [])
    const series = await buildMonthlySeries(NOW)
    expect(series.every((month) => month.withPostalCode === null)).toBe(true)
  })

  it('keeps it empty for a snapshot taken before the metric existed', async () => {
    queueDbResults(
      [],
      [
        {
          day: '2026-09-08',
          members: 12,
          newsletterSubscribed: 10,
          newsletterUnsubscribed: 2,
          telegramChannels: 0,
          blaettchenIssues: 0,
          withPostalCode: null,
        },
      ],
    )
    const series = await buildMonthlySeries(NOW)
    expect(series[11]).toMatchObject({ members: 12, derived: false, withPostalCode: null })
  })
})
