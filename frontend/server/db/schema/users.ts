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
    deletedAt: datetime('deleted_at'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date()),
  },
  (t) => [index('idx_users_deleted_at').on(t.deletedAt)],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
