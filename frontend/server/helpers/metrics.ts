import { readdir } from 'node:fs/promises'
import path from 'node:path'

import { asc, count as countRows, gte, sql } from 'drizzle-orm'

import { useDb } from '~~/server/db'
import { metricsDaily, telegramChannels, users } from '~~/server/db/schema'
import { parseBlaettchenFile } from '~~/shared/blaettchen'

/** The five numbers as they are right now. */
export interface CurrentMetrics {
  members: number
  newsletterSubscribed: number
  newsletterUnsubscribed: number
  telegramChannels: number
  blaettchenIssues: number
}

export interface MetricsMonth {
  /** `YYYY-MM`. */
  month: string
  members: number
  /**
   * True while the member count comes from join dates rather than from a
   * measurement. Everyone the sidecar first saw at the DAV cutover shares that
   * date, so the derived part of the curve shows a step there that was not a
   * real influx — the chart marks this span for exactly that reason.
   */
  derived: boolean
  /**
   * Measured where a snapshot exists, reconstructed from `updated_at` before
   * that — see `deriveNewsletterCounts` for what that reconstruction can and
   * cannot see.
   */
  newsletterSubscribed: number
  newsletterUnsubscribed: number
}

/** The window shown on the dashboard. */
export const METRICS_MONTHS = 12

/** `YYYY-MM` for the last `count` months, oldest first, `now` included. */
export function monthKeys(count: number, now: Date): string[] {
  const keys: string[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

/**
 * The first instant *after* a month — the exclusive bound a "how many were
 * there at the end of this month" count needs. The app runs with TZ=UTC, so
 * UTC is the process's own idea of a day boundary.
 */
export function monthEnd(month: string): Date {
  const [year, index] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(year, index, 1))
}

/**
 * How many members existed at each of the given month ends, from their join
 * and departure dates. Pure, because this is the part worth testing: it is the
 * only history that can be reconstructed at all.
 */
export function deriveMemberCounts(
  rows: { createdAt: Date; deletedAt: Date | null }[],
  months: string[],
): number[] {
  return months.map((month) => {
    const end = monthEnd(month)
    return rows.filter(
      (row) => row.createdAt < end && (row.deletedAt === null || row.deletedAt >= end),
    ).length
  })
}

/** A user row as the derivation needs it. */
export interface DerivableUser {
  createdAt: Date
  deletedAt: Date | null
  newsletterSubscribed: 'subscribed' | 'unsubscribed'
  updatedAt: Date
}

/**
 * The newsletter split at each month end, reconstructed from the current state
 * plus `updated_at`.
 *
 * Why this works at all: nothing touches an unsubscribed user's row on a
 * schedule. The sync only writes when the name, address or deleted flag really
 * changed (server/helpers/sync.ts), and the weekly send stamps
 * `newsletter_last_sent_at` on its *recipients* — who by definition are the
 * subscribed ones. So for somebody who is unsubscribed today, `updated_at` is
 * normally the moment they opted out.
 *
 * Two limits, both of which understate the past and vanish as the curve
 * approaches today:
 *   - it is an upper bound: a later name or email change moves the date
 *     forward, so the opt-out looks more recent than it was;
 *   - somebody who opted out and later re-subscribed is invisible — their row
 *     says "subscribed" and nothing remembers the detour.
 *
 * Subscribers need no separate reconstruction: a new account starts out
 * subscribed, so it is simply everyone present minus those who opted out.
 */
export function deriveNewsletterCounts(
  rows: DerivableUser[],
  months: string[],
): { subscribed: number[]; unsubscribed: number[] } {
  const subscribed: number[] = []
  const unsubscribed: number[] = []

  for (const month of months) {
    const end = monthEnd(month)
    const present = rows.filter(
      (row) => row.createdAt < end && (row.deletedAt === null || row.deletedAt >= end),
    )
    const optedOut = present.filter(
      (row) => row.newsletterSubscribed === 'unsubscribed' && row.updatedAt < end,
    ).length
    unsubscribed.push(optedOut)
    subscribed.push(present.length - optedOut)
  }

  return { subscribed, unsubscribed }
}

/** Today as `YYYY-MM-DD`, matching the process timezone (TZ=UTC). */
export function today(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** How many Telegram invitations are configured. */
export async function countTelegramChannels(): Promise<number> {
  const [row] = await useDb().select({ value: countRows() }).from(telegramChannels)
  return row?.value ?? 0
}

/** How many Blättchen issues are published. */
export async function countBlaettchenIssues(dir: string): Promise<number> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dito
    const entries = await readdir(path.resolve(process.cwd(), dir))
    return entries.filter((entry) => parseBlaettchenFile(entry) !== null).length
    // eslint-disable-next-line no-catch-all/no-catch-all -- dito
  } catch {
    return 0
  }
}

interface MetricsConfig {
  BLAETTCHEN_DIR: string
}

/** The current numbers. Soft-deleted users count for nothing. */
export async function collectCurrentMetrics(config: MetricsConfig): Promise<CurrentMetrics> {
  const db = useDb()
  const [counts] = await db
    .select({
      members: sql<string | number>`SUM(CASE WHEN ${users.deletedAt} IS NULL THEN 1 ELSE 0 END)`,
      subscribed: sql<
        string | number
      >`SUM(CASE WHEN ${users.deletedAt} IS NULL AND ${users.newsletterSubscribed} = 'subscribed' THEN 1 ELSE 0 END)`,
      unsubscribed: sql<
        string | number
      >`SUM(CASE WHEN ${users.deletedAt} IS NULL AND ${users.newsletterSubscribed} = 'unsubscribed' THEN 1 ELSE 0 END)`,
    })
    .from(users)

  return {
    // MySQL returns SUM() as a decimal string, and null for an empty table —
    // hence the conversion the types above make necessary rather than noise.
    members: Number(counts?.members ?? 0),
    newsletterSubscribed: Number(counts?.subscribed ?? 0),
    newsletterUnsubscribed: Number(counts?.unsubscribed ?? 0),
    telegramChannels: await countTelegramChannels(),
    blaettchenIssues: await countBlaettchenIssues(config.BLAETTCHEN_DIR),
  }
}

/**
 * Writes today's snapshot. Called at the end of every sync run — the cron hits
 * that every 10 minutes, so the row is written once and then overwritten all
 * day, which is what makes the series a daily one without its own schedule.
 */
export async function recordDailyMetrics(config: MetricsConfig, now = new Date()): Promise<void> {
  const current = await collectCurrentMetrics(config)
  const row = { day: today(now), ...current }
  await useDb().insert(metricsDaily).values(row).onDuplicateKeyUpdate({ set: current })
}

/**
 * The 12-month series behind the charts.
 *
 * Every figure is measured where a snapshot exists and reconstructed from the
 * user rows before that, so the curves reach back past the day measuring
 * started. The reconstruction is marked as such (`derived`) rather than passed
 * off as a measurement: it carries known biases, all of which fade as the
 * curve approaches today.
 */
export async function buildMonthlySeries(now = new Date()): Promise<MetricsMonth[]> {
  const db = useDb()
  const months = monthKeys(METRICS_MONTHS, now)
  const windowStart = monthEnd(months[0]!)
  windowStart.setUTCMonth(windowStart.getUTCMonth() - 1)

  const userRows = await db
    .select({
      createdAt: users.createdAt,
      deletedAt: users.deletedAt,
      newsletterSubscribed: users.newsletterSubscribed,
      updatedAt: users.updatedAt,
    })
    .from(users)
  const derivedMembers = deriveMemberCounts(userRows, months)
  const derivedNewsletter = deriveNewsletterCounts(userRows, months)

  const snapshots = await db
    .select()
    .from(metricsDaily)
    .where(gte(metricsDaily.day, today(windowStart)))
    .orderBy(asc(metricsDaily.day))

  // The last snapshot of a month is that month's measured value.
  const measured = new Map<string, (typeof snapshots)[number]>()
  for (const snapshot of snapshots) {
    measured.set(snapshot.day.slice(0, 7), snapshot)
  }

  return months.map((month, index) => {
    const snapshot = measured.get(month)
    return {
      month,
      // The derivations are built from the same month list, so index-for-index.
      members: snapshot ? snapshot.members : derivedMembers[index]!,
      derived: !snapshot,
      newsletterSubscribed: snapshot
        ? snapshot.newsletterSubscribed
        : derivedNewsletter.subscribed[index]!,
      newsletterUnsubscribed: snapshot
        ? snapshot.newsletterUnsubscribed
        : derivedNewsletter.unsubscribed[index]!,
    }
  })
}
