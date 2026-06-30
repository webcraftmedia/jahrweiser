import { sql } from 'drizzle-orm'
import { datetime, foreignKey, index, int, mysqlTable, varchar } from 'drizzle-orm/mysql-core'

import { registrationLinks } from './registration-links'
import { users } from './users'

// One row per account created through a registration link. The join count of a
// link is COUNT(*) over this table; the rows themselves are the "who joined"
// audit trail. Cascades with both the link and the user, so the count always
// reflects currently-existing joined users.
//
// FKs are named explicitly (`rlr_*`) and short: the auto-generated
// `{table}_{col}_{reftable}_{refcol}_fk` name would exceed MariaDB's 64-char
// identifier limit given the long table names.
export const registrationLinkRedemptions = mysqlTable(
  'registration_link_redemptions',
  {
    id: int('id').autoincrement().primaryKey(),
    linkToken: varchar('link_token', { length: 64 }).notNull(),
    userUid: varchar('user_uid', { length: 255 }).notNull(),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    foreignKey({
      columns: [t.linkToken],
      foreignColumns: [registrationLinks.token],
      name: 'rlr_link_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.userUid],
      foreignColumns: [users.uid],
      name: 'rlr_user_fk',
    }).onDelete('cascade'),
    index('idx_rlr_link').on(t.linkToken),
    index('idx_rlr_user').on(t.userUid),
  ],
)

export type RegistrationLinkRedemption = typeof registrationLinkRedemptions.$inferSelect
export type NewRegistrationLinkRedemption = typeof registrationLinkRedemptions.$inferInsert
