import { sql } from 'drizzle-orm'
import { boolean, datetime, index, mysqlEnum, mysqlTable, varchar } from 'drizzle-orm/mysql-core'

export const users = mysqlTable(
  'users',
  {
    uid: varchar('uid', { length: 255 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    displayName: varchar('display_name', { length: 255 }),
    role: mysqlEnum('role', ['user', 'admin']).notNull().default('user'),
    loginDisabled: boolean('login_disabled').notNull().default(false),
    // newsletter subscription state. NULL = no explicit choice (treat as
    // opt-in or opt-out based on phase). 'subscribed'/'unsubscribed' are
    // explicit user decisions.
    newsletterSubscribed: mysqlEnum('newsletter_subscribed', ['subscribed', 'unsubscribed']),
    // random one-click unsubscribe token, generated on first subscribe.
    // UNIQUE so the unsubscribe endpoint can look up by token alone.
    unsubscribeToken: varchar('unsubscribe_token', { length: 64 }).unique(),
    // last successful weekly-newsletter send. Used to avoid double-sending
    // when a manual trigger happens shortly before/after the cron run.
    newsletterLastSentAt: datetime('newsletter_last_sent_at'),
    deletedAt: datetime('deleted_at'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('idx_users_deleted_at').on(t.deletedAt),
    index('idx_users_newsletter_subscribed').on(t.newsletterSubscribed),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
