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
