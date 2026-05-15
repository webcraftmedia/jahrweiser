import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'

import * as schema from './schema'

import type { MySql2Database } from 'drizzle-orm/mysql2'

let pool: mysql.Pool | null = null
let db: MySql2Database<typeof schema> | null = null

interface DbConfig {
  user: string
  password: string
  database: string
  socket?: string
  host?: string
  port?: number
}

function readConfig(): DbConfig {
  const common = {
    user: process.env.DB_USER || 'jahrweiser',
    password: process.env.DB_PASSWORD || 'jahrweiser',
    database: process.env.DB_NAME || 'jahrweiser',
  }
  // DB_SOCKET takes priority — Alpine MariaDB defaults to unix-socket-only,
  // and an app user GRANTed for '@localhost' can only authenticate via socket.
  if (process.env.DB_SOCKET) {
    return { ...common, socket: process.env.DB_SOCKET }
  }
  return {
    ...common,
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  }
}

export function useDb() {
  if (db) return db
  const cfg = readConfig()
  pool = mysql.createPool({
    ...(cfg.socket
      ? { socketPath: cfg.socket }
      : { host: cfg.host, port: cfg.port }),
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    connectionLimit: 10,
    waitForConnections: true,
    namedPlaceholders: true,
  })
  db = drizzle(pool, { schema, mode: 'default' })
  return db
}

export async function closeDb() {
  if (pool) {
    await pool.end()
    pool = null
    db = null
  }
}
