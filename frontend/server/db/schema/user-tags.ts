import { index, mysqlTable, primaryKey, varchar } from 'drizzle-orm/mysql-core'

import { users } from './users'

export const userTags = mysqlTable(
  'user_tags',
  {
    userUid: varchar('user_uid', { length: 255 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    tag: varchar('tag', { length: 64 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userUid, t.tag] }), index('idx_user_tags_tag').on(t.tag)],
)

export type UserTag = typeof userTags.$inferSelect
export type NewUserTag = typeof userTags.$inferInsert
