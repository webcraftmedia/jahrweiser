import { sql } from 'drizzle-orm'
import { datetime, index, int, mysqlTable, varchar } from 'drizzle-orm/mysql-core'

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
    // The login code that travels in the same mail as the link — the same
    // credential, typed instead of clicked; redeeming either spends the row.
    // Only set when the request came from the login form, which bound it to
    // that browser: `code_key` is the SHA-256 of the binding cookie's nonce,
    // `code_hash` the SHA-256 of nonce and code. Neither column alone lets the
    // code be recovered — see server/helpers/loginCode.ts.
    codeKey: varchar('code_key', { length: 64 }),
    codeHash: varchar('code_hash', { length: 64 }),
    codeAttempts: int('code_attempts').notNull().default(0),
  },
  (t) => [
    index('idx_login_tokens_user').on(t.userUid),
    index('idx_login_tokens_expires').on(t.expiresAt),
    index('idx_login_tokens_code_key').on(t.codeKey),
  ],
)

export type LoginToken = typeof loginTokens.$inferSelect
export type NewLoginToken = typeof loginTokens.$inferInsert
