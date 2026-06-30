import { sql } from 'drizzle-orm'
import { datetime, index, int, mysqlTable, varchar } from 'drizzle-orm/mysql-core'

import { users } from './users'

// Admin-administered self-registration links. A link is a shareable secret
// (`/register/{token}`) that lets anyone holding it create their own account
// (email + first/last name). Counting "how many joined" and the audit trail of
// *who* joined lives in `registration_link_redemptions`, not here, so the count
// is race-free (COUNT(*)) and survives concurrent registrations.
export const registrationLinks = mysqlTable(
  'registration_links',
  {
    token: varchar('token', { length: 64 }).primaryKey(),
    // Which admin created the link. Cascade-deletes with the admin's user row,
    // consistent with the other auth tables.
    createdByUid: varchar('created_by_uid', { length: 255 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    // Free-text name so admins can tell links apart (e.g. "Flyer Herbstfest").
    label: varchar('label', { length: 255 }),
    // Optional cap on total joins. NULL = unlimited.
    maxUses: int('max_uses'),
    // Optional validity. NULL = never expires.
    expiresAt: datetime('expires_at'),
    // Set when an admin deactivates the link. A revoked link can never be used
    // again but is kept for its join history.
    revokedAt: datetime('revoked_at'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('idx_registration_links_created_by').on(t.createdByUid)],
)

export type RegistrationLink = typeof registrationLinks.$inferSelect
export type NewRegistrationLink = typeof registrationLinks.$inferInsert
