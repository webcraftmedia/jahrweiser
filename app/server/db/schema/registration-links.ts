import { sql } from 'drizzle-orm'
import { datetime, index, int, json, mysqlTable, varchar } from 'drizzle-orm/mysql-core'

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
    // Calendars a redeemer gets private access to, by CalDAV display name — the
    // same strings that live in a user's vCard CATEGORIES (see
    // server/api/calendar.post.ts). NULL = no calendar binding. Always a subset
    // of the creating admin's X-ADMIN-TAGS, enforced on write.
    //
    // Editable at any time: what a past join actually received is snapshotted on
    // its `registration_link_redemptions` row, so changing this never rewrites
    // history — it only changes what *future* redemptions grant.
    //
    // JSON rather than a comma-separated string (as X-ADMIN-TAGS has to be, the
    // vCard format leaves no choice) so a comma in a calendar name is harmless.
    calendars: json('calendars').$type<string[]>(),
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
