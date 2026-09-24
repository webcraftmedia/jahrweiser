import { sql } from 'drizzle-orm'
import { bigint, datetime, index, json, mysqlTable, varchar } from 'drizzle-orm/mysql-core'

import { users } from './users'

/**
 * What happened to a member, in order: link requested, mail sent, link redeemed
 * or refused, session opened or ended, newsletter delivered, admin intervened.
 *
 * Append-only. Nothing in the app updates a row here except the retention job,
 * which blanks the origin after 30 days and drops the row after 180 (see
 * `server/helpers/events.ts`) — an audit trail that can be edited answers no
 * question worth asking.
 *
 * Why this table exists: until now a member reporting "I cannot log in" left
 * nothing behind that could tell an expired link from a mail that never went
 * out from a session the browser dropped. The console said something once, to
 * a log that rotates and cannot be read per member.
 */
export const userEvents = mysqlTable(
  'user_events',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    // Millisecond precision on purpose: "link requested" and "mail sent" happen
    // inside the same second, and a chronicle that shows them in the wrong
    // order is worse than no chronicle.
    at: datetime('at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    /**
     * Free-form rather than an enum: a new event type is a one-line addition to
     * `USER_EVENT_TYPES`, not a migration. The union in TypeScript is what keeps
     * the values honest.
     */
    type: varchar('type', { length: 48 }).notNull(),
    /**
     * Who it is about. Null where an attempt cannot be attributed to a member —
     * a login request for an address nobody here uses. Deliberately *not*
     * stored with that address: a table of non-members who once typed something
     * into our form is a shadow list we have no business keeping.
     */
    userUid: varchar('user_uid', { length: 255 }).references(() => users.uid, {
      onDelete: 'cascade',
    }),
    /** The admin who caused it, where it was not the member themselves. */
    actorUid: varchar('actor_uid', { length: 255 }).references(() => users.uid, {
      onDelete: 'set null',
    }),
    /** Small, non-identifying context — a refusal reason, a calendar key. */
    meta: json('meta').$type<Record<string, unknown>>(),
    /**
     * Truncated origin (IPv4 /24, IPv6 /48), blanked after 30 days. Enough to
     * see that ten refused attempts came from one network, not enough to point
     * at a household — and never a basis for a decision: behind a proxy this is
     * a forwarded header, which the client can set.
     */
    ipPrefix: varchar('ip_prefix', { length: 45 }),
  },
  (t) => [
    // The member's chronicle, newest first — the one query the detail page runs.
    index('idx_user_events_user_at').on(t.userUid, t.at),
    // Retention sweeps, and the unattributed attempts (`user_uid IS NULL`)
    // that no chronicle covers.
    index('idx_user_events_at').on(t.at),
    index('idx_user_events_type_at').on(t.type, t.at),
  ],
)

export type UserEvent = typeof userEvents.$inferSelect
export type NewUserEvent = typeof userEvents.$inferInsert
