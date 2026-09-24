import { drizzle } from 'drizzle-orm/mysql2'
import { createPool } from 'mysql2/promise'

import * as schema from './schema'

import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { Pool } from 'mysql2/promise'

let pool: Pool | null = null
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
  pool = createPool({
    ...(cfg.socket ? { socketPath: cfg.socket } : { host: cfg.host, port: cfg.port }),
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    connectionLimit: 10,
    waitForConnections: true,
    namedPlaceholders: true,
    // A connection attempt that hangs is worse than one that fails: the caller
    // has no timeout of its own, so it would wait for the OS to give up.
    connectTimeout: 5_000,
    // Detect half-open sockets — a firewall or router that drops an idle NAT
    // entry leaves connections that look usable and answer nothing. Without
    // keepalive they stay in the pool until a query picks one and stalls on it.
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    // Retire idle connections rather than hold all ten open forever; a restarted
    // database then costs one failed query instead of ten stale sockets.
    maxIdle: 10,
    idleTimeout: 60_000,
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
