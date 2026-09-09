import { sql } from 'drizzle-orm'
import { boolean, datetime, int, mysqlTable, varchar } from 'drizzle-orm/mysql-core'

import { users } from './users'

// The Telegram invitations shown on /telegram, administered from /admin/telegram.
//
// They used to live in a git-ignored JSON file, which was right while only a
// person with shell access wrote it. Once the app writes them, they are
// application data: two admins editing a whole-file list lose each other's
// changes without a trace, a half-written file takes the whole section down,
// and nobody can tell afterwards who added a private invite link. The table
// answers all three, and the app already depends on this database to let
// anyone log in at all.
export const telegramChannels = mysqlTable('telegram_channels', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 500 }),
  // Always a https://t.me/… link — see shared/telegram.ts for the check that
  // keeps a typo from turning this list into an open-redirect surface.
  url: varchar('url', { length: 500 }).notNull(),
  // Only a label for the reader; it has no effect on how the link is used.
  isPublic: boolean('is_public').notNull().default(false),
  // Manual order on /telegram: which channel matters most is not something an
  // alphabet or a creation date can know. Rewritten as a dense 0..n-1 sequence
  // on every move, so gaps and duplicates (e.g. from the one-off import) heal
  // themselves.
  sortOrder: int('sort_order').notNull().default(0),
  // Which admin added it. Nullable and `set null` rather than the cascade the
  // registration links use: deleting an admin account must not take the
  // community's channel list with it.
  createdByUid: varchar('created_by_uid', { length: 255 }).references(() => users.uid, {
    onDelete: 'set null',
  }),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .$onUpdate(() => new Date()),
})

export type TelegramChannelRow = typeof telegramChannels.$inferSelect
export type NewTelegramChannelRow = typeof telegramChannels.$inferInsert
