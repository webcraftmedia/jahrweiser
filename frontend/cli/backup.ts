import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import mysql from 'mysql2/promise'

import {
  calendarKey,
  calendarLabel,
  createCalDAVAccount,
  createCardDAVAccount,
  findAllCalendarObjects,
  findAllUsers,
  findCalendars,
} from '../server/helpers/dav'

import { config } from './tools/config'

/**
 * Read-only export of everything the app owns: the MariaDB sidecar and the full
 * DAV content (address book + all calendars).
 *
 * Deliberately no production guard - running this against production is the
 * whole point. It only reads.
 *
 * The DB dump is built in JS rather than by shelling out to `mariadb-dump`,
 * which lives only in the database container and not where the app runs.
 *
 * Restore:
 *   DB   `mariadb -u<user> -p <db> < db.sql`
 *   DAV  PUT each .vcf/.ics back to its collection URL (paths mirror the
 *        collection layout; see manifest.json for the base URLs).
 */

const argv = process.argv.slice(2)
function flagValue(name: string): string | undefined {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

// sessions and login_tokens are transient auth artefacts. Restoring them would
// revive already-spent login tokens and expired sessions, so they stay out
// unless explicitly asked for. Everything else is needed for a full restore.
const CORE_TABLES = [
  '__drizzle_migrations',
  'users',
  'user_tags',
  'sync_state',
  'registration_links',
  'registration_link_redemptions',
  'telegram_channels',
]
const AUTH_TABLES = ['sessions', 'login_tokens']

const includeAuth = argv.includes('--include-auth')
const tables = includeAuth ? [...CORE_TABLES, ...AUTH_TABLES] : CORE_TABLES

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = path.resolve(flagValue('--out') ?? path.join(process.cwd(), 'backups', stamp))

console.warn(`[backup] Writing to ${outDir}`)
console.warn(
  '[backup] NOTE: this export contains personal data (names, e-mail addresses, appointments).\n' +
    '         Store it encrypted and give it a retention period.',
)

await mkdir(outDir, { recursive: true })

// ---------------------------------------------------------------------------
// MariaDB
// ---------------------------------------------------------------------------
const connection = await mysql.createConnection(
  process.env.DB_SOCKET
    ? {
        socketPath: process.env.DB_SOCKET,
        user: config.DB_USER,
        password: config.DB_PASSWORD,
        database: config.DB_NAME,
      }
    : {
        host: config.DB_HOST,
        port: config.DB_PORT,
        user: config.DB_USER,
        password: config.DB_PASSWORD,
        database: config.DB_NAME,
      },
)

/**
 * One SQL literal. mysql2 escapes strings, dates and buffers correctly, but
 * would turn an array into a comma-separated list and an object into a
 * key-value assignment - both wrong for a single column value, so JSON columns
 * are stringified first.
 */
function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (value instanceof Date || Buffer.isBuffer(value)) return connection.escape(value)
  if (typeof value === 'object') return connection.escape(JSON.stringify(value))
  return connection.escape(value)
}

const sql: string[] = [
  '-- Jahrweiser data backup',
  `-- taken: ${new Date().toISOString()}`,
  `-- database: ${config.DB_NAME}`,
  includeAuth ? '-- includes transient auth tables (--include-auth)' : '',
  '',
  'SET FOREIGN_KEY_CHECKS=0;',
  '',
]
const rowCounts: Record<string, number> = {}

for (const table of tables) {
  const [rows] = await connection.query(`SELECT * FROM \`${table}\``)
  const list = rows as Record<string, unknown>[]
  rowCounts[table] = list.length
  sql.push(`-- ${table}: ${list.length} row(s)`)
  // Truncate before inserting so a restore is idempotent rather than additive.
  sql.push(`DELETE FROM \`${table}\`;`)
  for (const row of list) {
    const columns = Object.keys(row)
      .map((c) => `\`${c}\``)
      .join(', ')
    const values = Object.values(row).map(literal).join(', ')
    sql.push(`INSERT INTO \`${table}\` (${columns}) VALUES (${values});`)
  }
  sql.push('')
  console.warn(`  db   ${table}: ${list.length} row(s)`)
}

sql.push('SET FOREIGN_KEY_CHECKS=1;', '')
await writeFile(path.join(outDir, 'db.sql'), sql.join('\n'), 'utf-8')
await connection.end()

// ---------------------------------------------------------------------------
// DAV
// ---------------------------------------------------------------------------
/** Last URL segment, used as the on-disk filename. */
function fileNameOf(url: string, fallback: string): string {
  const segment = decodeURIComponent(url.replace(/\/+$/, '').split('/').pop() ?? '')
  // Anything path-ish would let a hostile DAV response escape the output dir.
  return /^[\w.@-]+$/.test(segment) ? segment : fallback
}

const cardDavAccount = createCardDAVAccount(config)
const calDavAccount = createCalDAVAccount(config)

const bookDir = path.join(outDir, 'dav', 'addressbook')
await mkdir(bookDir, { recursive: true })
const cards = await findAllUsers(cardDavAccount)
let cardCount = 0
for (const [index, card] of cards.entries()) {
  if (!card.data) continue
  await writeFile(
    path.join(bookDir, fileNameOf(card.url, `contact-${index}.vcf`)),
    card.data,
    'utf-8',
  )
  cardCount += 1
}
console.warn(`  dav  addressbook: ${cardCount} contact(s)`)

const calendars = await findCalendars(calDavAccount)
const calendarSummary: { key: string; label: string; url: string; objects: number }[] = []
for (const calendar of calendars) {
  const key = calendarKey(calendar)
  const dir = path.join(outDir, 'dav', 'calendars', fileNameOf(calendar.url, key))
  await mkdir(dir, { recursive: true })
  const objects = await findAllCalendarObjects(calDavAccount, calendar.url)
  let count = 0
  for (const [index, object] of objects.entries()) {
    if (!object.data) continue
    await writeFile(
      path.join(dir, fileNameOf(object.url, `event-${index}.ics`)),
      object.data,
      'utf-8',
    )
    count += 1
  }
  calendarSummary.push({ key, label: calendarLabel(calendar), url: calendar.url, objects: count })
  console.warn(`  dav  calendar ${key}: ${count} object(s)`)
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
await writeFile(
  path.join(outDir, 'manifest.json'),
  JSON.stringify(
    {
      takenAt: new Date().toISOString(),
      database: { name: config.DB_NAME, tables: rowCounts, includesAuthTables: includeAuth },
      dav: {
        serverUrl: config.DAV_URL,
        addressBookUrl: cardDavAccount.homeUrl,
        contacts: cardCount,
        calendars: calendarSummary,
      },
    },
    null,
    2,
  ) + '\n',
  'utf-8',
)

console.warn(`\n[backup] Done: ${outDir}`)
console.warn('[backup] Restore: `mariadb -u<user> -p <db> < db.sql`; PUT the .vcf/.ics back to')
console.warn('         the collection URLs recorded in manifest.json.')
