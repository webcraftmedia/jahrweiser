import { randomBytes } from 'node:crypto'

import { createPool } from 'mysql2/promise'

import type { Pool } from 'mysql2/promise'

let pool: Pool | null = null

function getPool(): Pool {
  if (pool) return pool
  const base = {
    user: process.env.DB_USER || 'jahrweiser',
    password: process.env.DB_PASSWORD || 'jahrweiser',
    database: process.env.DB_NAME || 'jahrweiser',
    connectionLimit: 2,
    waitForConnections: true,
  }
  pool = process.env.DB_SOCKET
    ? createPool({ ...base, socketPath: process.env.DB_SOCKET })
    : createPool({
        ...base,
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      })
  return pool
}

export async function setLoginDisabled(email: string, disabled: boolean): Promise<void> {
  await getPool().query('UPDATE users SET login_disabled = ? WHERE email = ?', [disabled, email])
}

/**
 * Subscribes a user to the newsletter without going through the UI / API.
 * Also resets login_disabled and deleted_at so callers can safely re-use the
 * same seed across retries without state bleed.
 */
export async function subscribeUserDirectly(email: string): Promise<void> {
  const token = randomBytes(32).toString('hex')
  await getPool().query(
    `UPDATE users
        SET newsletter_subscribed = 'subscribed',
            unsubscribe_token = ?,
            login_disabled = FALSE,
            deleted_at = NULL
      WHERE email = ?`,
    [token, email],
  )
}

export async function softDeleteUser(email: string): Promise<void> {
  await getPool().query('UPDATE users SET deleted_at = NOW() WHERE email = ?', [email])
}

/** The mirrored admin tags of a contact, in the spelling the database holds. */
export async function readUserTags(uid: string): Promise<string[]> {
  const [rows] = await getPool().query('SELECT tag FROM user_tags WHERE user_uid = ?', [uid])
  return (rows as { tag: string }[]).map((row) => row.tag).sort()
}

export async function closeDb(): Promise<void> {
  if (!pool) return
  await pool.end()
  pool = null
}

export interface SeedChannel {
  name: string
  description?: string
  url: string
  public?: boolean
}

/**
 * Replaces the Telegram channel list. The suite owns this table outright — it
 * is deployment content, not seeded demo data, so nothing else fills it.
 * Written in list order, which is what `sort_order` means.
 */
export async function setTelegramChannels(channels: SeedChannel[]): Promise<void> {
  await getPool().query('DELETE FROM telegram_channels')
  for (const [index, channel] of channels.entries()) {
    await getPool().query(
      `INSERT INTO telegram_channels (name, description, url, is_public, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [channel.name, channel.description ?? null, channel.url, channel.public ?? false, index],
    )
  }
}

/** One row exactly as the table stores it, for stash/restore. */
export interface TelegramChannelRow {
  id: number
  name: string
  description: string | null
  url: string
  is_public: number
  sort_order: number
  created_by_uid: string | null
  created_at: Date
  updated_at: Date
}

/**
 * Reads the whole table so a suite can put it back afterwards. Unlike users or
 * calendar events, the channels are not re-created by `cli:seed:demo` — they
 * are deployment content. A suite that simply cleared the table would eat a
 * developer's real list, which is why every suite touching it stashes first.
 */
export async function stashTelegramChannels(): Promise<TelegramChannelRow[]> {
  const [rows] = await getPool().query('SELECT * FROM telegram_channels ORDER BY id')
  return rows as TelegramChannelRow[]
}

/** Puts a stashed list back verbatim, ids and positions included. */
export async function restoreTelegramChannels(rows: TelegramChannelRow[]): Promise<void> {
  await getPool().query('DELETE FROM telegram_channels')
  for (const row of rows) {
    await getPool().query('INSERT INTO telegram_channels SET ?', [row])
  }
}

/** The channel names in the order the table returns them. */
export async function readTelegramChannelOrder(): Promise<string[]> {
  const [rows] = await getPool().query('SELECT name FROM telegram_channels ORDER BY sort_order, id')
  return (rows as { name: string }[]).map((row) => row.name)
}

/**
 * Gives a member one session last used at `lastSeen`, replacing any they had.
 * Written as a naive UTC datetime — the way the app itself stores it (the
 * process runs with TZ=UTC) — so the read path is exercised exactly as in
 * production, `MAX()` and all.
 */
export async function setLastSeen(email: string, lastSeen: Date): Promise<void> {
  const [rows] = await getPool().query('SELECT uid FROM users WHERE email = ?', [email])
  const uid = (rows as { uid: string }[])[0]?.uid
  if (!uid) throw new Error(`setLastSeen: no user ${email}`)
  const naive = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ')
  await getPool().query('DELETE FROM sessions WHERE user_uid = ?', [uid])
  await getPool().query(
    `INSERT INTO sessions (id, user_uid, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      `e2e-${randomBytes(16).toString('hex')}`,
      uid,
      naive(new Date(lastSeen.getTime() - 60_000)),
      naive(new Date(lastSeen.getTime() + 30 * 24 * 60 * 60 * 1000)),
      naive(lastSeen),
    ],
  )
}

/** One `metrics_daily` row as the table stores it. */
export type MetricsDayRow = Record<string, unknown> & { day: string }

/**
 * Today's snapshot, if any — taken before a test makes the sync write one, so
 * a developer's own measurement for the day is put back afterwards.
 */
export async function readMetricsDay(day: string): Promise<MetricsDayRow | null> {
  const [rows] = await getPool().query(
    "SELECT *, DATE_FORMAT(day, '%Y-%m-%d') AS day FROM metrics_daily WHERE day = ?",
    [day],
  )
  return (rows as MetricsDayRow[])[0] ?? null
}

/** Puts a stashed snapshot back, or removes the day's row if there was none. */
export async function restoreMetricsDay(day: string, row: MetricsDayRow | null): Promise<void> {
  await getPool().query('DELETE FROM metrics_daily WHERE day = ?', [day])
  if (row) await getPool().query('INSERT INTO metrics_daily SET ?', [row])
}
