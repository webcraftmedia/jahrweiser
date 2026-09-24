import { and, desc, eq, like } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { userEvents } from '~~/server/db/schema'
import { requireAdmin } from '~~/server/helpers/requireAdmin'

/**
 * A member's chronicle: every line the app wrote about them, newest first.
 *
 * Filtered by prefix rather than by an exhaustive list of types, so a new event
 * type appears under its group (`auth.`, `session.`, `newsletter.`, `admin.`)
 * without this endpoint having to learn about it — the same reason the column
 * is a varchar. See `server/helpers/events.ts`.
 *
 * What is *not* here: an address, a token, a full IP. The trail was written
 * that way; this only reads it back.
 */

const PER_PAGE = 50

const querySchema = z.object({
  /** One of the groups, or nothing for all of them. */
  group: z.enum(['auth', 'session', 'newsletter', 'profile', 'register', 'admin']).optional(),
  page: z.coerce.number().int().min(1).default(1),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const uid = getRouterParam(event, 'uid')
  if (!uid) {
    throw createError({ statusCode: 400, statusMessage: 'Missing uid' })
  }

  const { group, page } = querySchema.parse(getQuery(event))
  const db = useDb()

  const where = group
    ? and(eq(userEvents.userUid, uid), like(userEvents.type, `${group}.%`))
    : eq(userEvents.userUid, uid)

  const rows = await db
    .select()
    .from(userEvents)
    .where(where)
    .orderBy(desc(userEvents.at), desc(userEvents.id))
    .limit(PER_PAGE)
    .offset((page - 1) * PER_PAGE)

  return {
    events: rows.map((row) => ({
      id: row.id,
      at: row.at.toISOString(),
      type: row.type,
      meta: row.meta,
      // Already a network rather than an address when it was written, and
      // blanked entirely after 30 days.
      origin: row.ipPrefix,
      /** Set when an admin caused this, not the member themselves. */
      actorUid: row.actorUid,
    })),
    page,
    perPage: PER_PAGE,
  }
})
