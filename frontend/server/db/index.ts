import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'

import * as schema from './schema'

import type { MySql2Database } from 'drizzle-orm/mysql2'

let pool: mysql.Pool | null = null
let db: MySql2Database<typeof schema> | null = null

interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

function readConfig(): DbConfig {
  const cfg = useRuntimeConfig()
  return {
    host: cfg.DB_HOST,
    port: Number(cfg.DB_PORT),
    user: cfg.DB_USER,
    password: cfg.DB_PASSWORD,
    database: cfg.DB_NAME,
  }
}

export function useDb() {
  if (db) return db
  const cfg = readConfig()
  pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
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
