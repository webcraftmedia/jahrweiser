import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { max } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../server/db'
import { telegramChannels } from '../server/db/schema'
import { isTelegramUrl } from '../shared/telegram'

// Loading the Nuxt config also reads `.env` into `process.env`, which is where
// `useDb()` picks up `DB_SOCKET` & friends. Without this import the CLI
// silently falls back to TCP `localhost:3306` and fails on production, where
// MariaDB only listens on a unix socket.
import { config } from './tools/config'

/**
 * One-off import of the old `data/telegram-channels.json` into the sidecar
 * table, for deployments that ran the file-based version.
 *
 * Idempotent by URL: a channel that is already in the table is skipped, so an
 * interrupted run can simply be repeated, and running it twice does not
 * duplicate the list. Nothing is deleted or overwritten — this only ever adds.
 *
 * Safe to run against production (that is the point), hence no
 * `assertLocalEnv` guard. After a successful import the JSON file is no longer
 * read by anything and can be deleted; see docu/telegram-channels.md.
 *
 *   npm run cli:telegram:import [-- <pfad/zur/datei.json>]
 */
const fileSchema = z.array(
  z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    url: z.url().refine(isTelegramUrl, { message: 'must be a https://t.me/ link' }),
    public: z.boolean().optional(),
  }),
)

const file = path.resolve(
  process.cwd(),
  process.argv[2] || process.env.TELEGRAM_CHANNELS_FILE || 'data/telegram-channels.json',
)

let raw: string
try {
  raw = await readFile(file, 'utf-8')
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    console.error(`No channel file at ${file} — nothing to import.`)
    process.exit(1)
  }
  throw error
}

const parsed = fileSchema.safeParse(JSON.parse(raw))
if (!parsed.success) {
  console.error(`${file} is not a valid channel list:`)
  console.error(z.prettifyError(parsed.error))
  process.exit(1)
}

// Which database this one-off run is about to write to — worth stating, since
// it is usually typed into a production shell.
const target = process.env.DB_SOCKET
  ? `socket ${process.env.DB_SOCKET}`
  : `${config.DB_HOST}:${config.DB_PORT}`
console.warn(`Importing into ${config.DB_NAME} (${target}) from ${file}`)

const db = useDb()
const existing = new Set(
  (await db.select({ url: telegramChannels.url }).from(telegramChannels)).map((row) => row.url),
)
const [aggregate] = await db
  .select({ value: max(telegramChannels.sortOrder) })
  .from(telegramChannels)

let position = (aggregate?.value ?? -1) + 1
let imported = 0
for (const channel of parsed.data) {
  if (existing.has(channel.url)) {
    console.warn(`  skip  ${channel.name} — already in the table`)
    continue
  }
  await db.insert(telegramChannels).values({
    name: channel.name,
    description: channel.description || null,
    url: channel.url,
    isPublic: channel.public ?? false,
    // File order becomes list order; an admin can rearrange it afterwards.
    sortOrder: position,
    // Nobody to attribute: the file had no author.
    createdByUid: null,
  })
  position += 1
  imported += 1
  console.warn(`  add   ${channel.name}`)
}

console.warn(
  `Imported ${imported} of ${parsed.data.length} channel(s) from ${file}. ` +
    `The file is no longer read by the app and can be removed.`,
)
process.exit(0)
