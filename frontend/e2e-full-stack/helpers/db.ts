import { randomBytes } from 'node:crypto'

import mysql from 'mysql2/promise'

let pool: mysql.Pool | null = null

function getPool(): mysql.Pool {
  if (pool) return pool
  const base = {
    user: process.env.DB_USER || 'jahrweiser',
    password: process.env.DB_PASSWORD || 'jahrweiser',
    database: process.env.DB_NAME || 'jahrweiser',
    connectionLimit: 2,
    waitForConnections: true,
  }
  pool = process.env.DB_SOCKET
    ? mysql.createPool({ ...base, socketPath: process.env.DB_SOCKET })
    : mysql.createPool({
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
