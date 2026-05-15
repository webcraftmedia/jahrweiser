import { sql } from 'drizzle-orm'
import { datetime, index, mysqlTable, varchar } from 'drizzle-orm/mysql-core'

import { users } from './users'

export const loginTokens = mysqlTable(
  'login_tokens',
  {
    token: varchar('token', { length: 64 }).primaryKey(),
    userUid: varchar('user_uid', { length: 255 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    requestedAt: datetime('requested_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    expiresAt: datetime('expires_at').notNull(),
    consumedAt: datetime('consumed_at'),
  },
  (t) => [
    index('idx_login_tokens_user').on(t.userUid),
    index('idx_login_tokens_expires').on(t.expiresAt),
  ],
)

export type LoginToken = typeof loginTokens.$inferSelect
export type NewLoginToken = typeof loginTokens.$inferInsert
