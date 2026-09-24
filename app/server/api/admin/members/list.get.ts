import { and, asc, eq, isNotNull, isNull, like, sql } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { sessions, users } from '~~/server/db/schema'
import { recordEvent } from '~~/server/helpers/events'
import { requireAdmin } from '~~/server/helpers/requireAdmin'
import { abbreviateName, maskEmail } from '~~/shared/mask'

/**
 * The members' list, and the only way to search it.
 *
 * Two searches in one field, told apart by whether the input contains an `@`:
 *
 * - **A name** matches loosely, anywhere in the display name.
 * - **An address** matches *exactly*, or not at all. This is the rule the whole
 *   masking rests on: with a prefix search, `a@`, `b@`, `c@` would walk the
 *   directory out from behind the mask in an afternoon. Exact match answers
 *   only for somebody who already holds the address — and each of those
 *   answers is written into the member's own chronicle, so looking is visible.
 *
 * Nothing here ever returns an address. `maskEmail` runs on the way out, in
 * this handler, so the response simply does not contain one — masking in the
 * template would leave the original sitting in the network tab.
 */

/**
 * Not client-controlled, and deliberately small. A page size in the query
 * string is an invitation to ask for all of them at once, and "the whole
 * directory in one response" is the shape of data we do not want to produce,
 * masked or not.
 */
const PER_PAGE = 25

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['all', 'active', 'blocked', 'deleted']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
})

export type MemberStatus = 'active' | 'blocked' | 'deleted'
export type StatusFilter = MemberStatus | 'all'

/**
 * `LIKE` treats `%` and `_` as wildcards, so a member typing either would
 * match half the directory — and `%` alone would list all of it.
 */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/**
 * What a search box entry means, decided before any SQL is built.
 *
 * Pulled out as a pure function because this is where the privacy rule lives:
 * an `@` turns the input into an exact address match, everything else into a
 * loose name match. Getting that backwards would hand out the directory, and a
 * rule that important should be testable without a database.
 */
export interface SearchCriteria {
  status: StatusFilter
  /** Exact address to match, already normalised. Set only for an `@` term. */
  email?: string
  /** `LIKE` pattern for the display name, wildcards already escaped. */
  namePattern?: string
}

export function criteriaFor(term: string, status: StatusFilter): SearchCriteria {
  const trimmed = term.trim()
  if (!trimmed) return { status }
  if (trimmed.includes('@')) return { status, email: trimmed.toLowerCase() }
  return { status, namePattern: `%${escapeLike(trimmed)}%` }
}

export interface MemberRow {
  uid: string
  /** Abbreviated — `Anna M.` */
  name: string
  /** Masked — `an•••@ex•••.de` */
  email: string
  role: string
  status: MemberStatus
  newsletter: string
  createdAt: string | null
  /** When any of their sessions was last used. */
  lastSeenAt: string | null
  /** Sessions that would still let them in right now. */
  activeSessions: number
}

/** What the row says, in one word, in the order that matters. */
function statusOf(row: { deletedAt: Date | null; loginDisabled: boolean }): MemberStatus {
  if (row.deletedAt !== null) return 'deleted'
  return row.loginDisabled ? 'blocked' : 'active'
}

/**
 * MySQL hands datetimes back as `Date`; a raw `MAX()` may not be mapped and can
 * arrive as the naive string `2026-09-01 08:00:00`.
 *
 * That string carries no zone, and `new Date()` would read it as *local* time —
 * which silently shifts every timestamp by the process's offset. The stored
 * values are UTC (the Nitro process runs with `TZ=UTC`, see nuxt.config.ts), so
 * the zone is stated here rather than left to the environment.
 */
function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'string' || value === '') return null

  // Two plain tests rather than one pattern with an optional tail: a zoned
  // value starts exactly like a naive one, so the zone is what tells them apart.
  const isTimestamp = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(value)
  const statesZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  const naive = isTimestamp && !statesZone

  return new Date(naive ? `${value.replace(' ', 'T')}Z` : value).toISOString()
}

export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const { q, status, page } = querySchema.parse(getQuery(event))
  const db = useDb()

  const criteria = criteriaFor(q ?? '', status)

  const filters = []
  if (criteria.status === 'active') {
    filters.push(isNull(users.deletedAt), eq(users.loginDisabled, false))
  }
  if (criteria.status === 'blocked') {
    filters.push(isNull(users.deletedAt), eq(users.loginDisabled, true))
  }
  if (criteria.status === 'deleted') filters.push(isNotNull(users.deletedAt))
  if (criteria.email !== undefined) filters.push(eq(users.email, criteria.email))
  if (criteria.namePattern !== undefined)
    filters.push(like(users.displayName, criteria.namePattern))

  const where = filters.length > 0 ? and(...filters) : undefined

  const counted = await db
    .select({ value: sql<string>`count(*)` })
    .from(users)
    .where(where)
  const total = Number(counted[0].value)

  const rows = await db
    .select({
      uid: users.uid,
      displayName: users.displayName,
      email: users.email,
      role: users.role,
      loginDisabled: users.loginDisabled,
      deletedAt: users.deletedAt,
      newsletter: users.newsletterSubscribed,
      createdAt: users.createdAt,
      lastSeenAt: sql`MAX(${sessions.lastSeenAt})`,
      // Counted in SQL rather than by fetching the sessions: the list only
      // needs the number, and a member with forty old sessions should not cost
      // forty rows on the wire.
      // `string | null`, not `string`: with no joined session at all the SUM is
      // NULL, and typing that away would make the fallback below look pointless.
      activeSessions: sql<
        string | null
      >`SUM(CASE WHEN ${sessions.revokedAt} IS NULL AND ${sessions.expiresAt} > NOW() THEN 1 ELSE 0 END)`,
    })
    .from(users)
    .leftJoin(sessions, eq(sessions.userUid, users.uid))
    .where(where)
    .groupBy(users.uid)
    .orderBy(asc(users.displayName))
    .limit(PER_PAGE)
    .offset((page - 1) * PER_PAGE)

  const members: MemberRow[] = rows.map((row) => ({
    uid: row.uid,
    name: abbreviateName(row.displayName),
    email: maskEmail(row.email),
    role: row.role,
    status: statusOf(row),
    newsletter: row.newsletter,
    createdAt: toIso(row.createdAt),
    lastSeenAt: toIso(row.lastSeenAt),
    activeSessions: Number(row.activeSessions ?? 0),
  }))

  // Recorded only when an address search found somebody: a hit means an admin
  // established that this person is a member, which belongs in that person's
  // chronicle. A miss concerns nobody here, and writing the attempt down would
  // mean keeping the address that was tried.
  if (criteria.email !== undefined && members.length === 1) {
    await recordEvent({
      type: 'admin.email_lookup',
      userUid: members[0]!.uid,
      actorUid: actor.uid,
      event,
    })
  }

  return { members, total, page, perPage: PER_PAGE }
})
