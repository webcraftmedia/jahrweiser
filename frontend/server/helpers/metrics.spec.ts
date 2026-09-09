// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { dbCalls, firstDbCall, mockDb, queueDbResults, resetDb } from '../../test/helpers/mock-db'

import {
  buildMonthlySeries,
  collectCurrentMetrics,
  countBlaettchenIssues,
  countTelegramChannels,
  deriveMemberCounts,
  monthEnd,
  monthKeys,
  recordDailyMetrics,
  today,
} from './metrics'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const fs = vi.hoisted(() => ({ readdir: vi.fn() }))
vi.mock('node:fs/promises', () => fs)

const CONFIG = { BLAETTCHEN_DIR: 'data/blaettchen' }

function user(createdAt: string, deletedAt: string | null = null) {
  return { createdAt: new Date(createdAt), deletedAt: deletedAt ? new Date(deletedAt) : null }
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

describe('collectCurrentMetrics', () => {
  beforeEach(() => {
    resetDb()
    vi.clearAllMocks()
    fs.readdir.mockResolvedValue([])
  })

  it('converts the decimal strings MySQL returns for SUM()', async () => {
    queueDbResults([{ members: '42', subscribed: '37', unsubscribed: '5' }], [{ value: 1 }])
    fs.readdir.mockResolvedValue(['12_2026-05-01.pdf'])
    await expect(collectCurrentMetrics(CONFIG)).resolves.toStrictEqual({
      members: 42,
      newsletterSubscribed: 37,
      newsletterUnsubscribed: 5,
      telegramChannels: 1,
      blaettchenIssues: 1,
    })
  })

  it('reads an empty sidecar as zeros rather than NaN', async () => {
    // SUM() over no rows is NULL, not 0.
    queueDbResults([{ members: null, subscribed: null, unsubscribed: null }], [{ value: 0 }])
    const metrics = await collectCurrentMetrics(CONFIG)
    expect(metrics.members).toBe(0)
    expect(metrics.newsletterSubscribed).toBe(0)
  })

  it('survives a query that returns no row at all', async () => {
    queueDbResults([], [])
    await expect(collectCurrentMetrics(CONFIG)).resolves.toMatchObject({ members: 0 })
  })
})

describe('recordDailyMetrics', () => {
  beforeEach(() => {
    resetDb()
    vi.clearAllMocks()
    fs.readdir.mockResolvedValue([])
  })

  it('writes one row keyed by the day, overwriting an earlier run', async () => {
    // The cron hits the sync every ten minutes; without the upsert this would
    // be 144 rows a day instead of one.
    queueDbResults([{ members: '4', subscribed: '3', unsubscribed: '1' }], [{ value: 0 }])
    await recordDailyMetrics(CONFIG, new Date('2026-09-09T08:00:00Z'))
    expect(firstDbCall('values')?.[0]).toStrictEqual({
      day: '2026-09-09',
      members: 4,
      newsletterSubscribed: 3,
      newsletterUnsubscribed: 1,
      telegramChannels: 0,
      blaettchenIssues: 0,
    })
    expect(dbCalls().some((call) => call.method === 'onDuplicateKeyUpdate')).toBe(true)
  })

  it('does not put the day into the update set — it is the key', async () => {
    queueDbResults([{ members: '4', subscribed: '3', unsubscribed: '1' }], [{ value: 0 }])
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

  it('leaves newsletter figures empty where nothing was measured', async () => {
    // They cannot be reconstructed — no column records when someone opted out.
    queueDbResults([user('2025-09-01')], [])
    const series = await buildMonthlySeries(NOW)
    expect(series.every((month) => month.newsletterSubscribed === null)).toBe(true)
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
        },
        {
          day: '2026-09-08',
          members: 12,
          newsletterSubscribed: 10,
          newsletterUnsubscribed: 2,
          telegramChannels: 0,
          blaettchenIssues: 0,
        },
      ],
    )
    const series = await buildMonthlySeries(NOW)
    expect(series[11]).toMatchObject({ members: 12, newsletterUnsubscribed: 2 })
  })
})
