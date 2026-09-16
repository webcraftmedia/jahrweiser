import { sql } from 'drizzle-orm'
import { datetime, index, mysqlTable, varchar } from 'drizzle-orm/mysql-core'

import { users } from './users'

export const sessions = mysqlTable(
  'sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userUid: varchar('user_uid', { length: 255 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    expiresAt: datetime('expires_at').notNull(),
    revokedAt: datetime('revoked_at'),
    lastSeenAt: datetime('last_seen_at'),
  },
  (t) => [index('idx_sessions_user').on(t.userUid), index('idx_sessions_expires').on(t.expiresAt)],
)

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
