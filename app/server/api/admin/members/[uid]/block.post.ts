import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { sessions, users } from '~~/server/db/schema'
import { recordEvent } from '~~/server/helpers/events'
import { requireAdmin } from '~~/server/helpers/requireAdmin'

/**
 * Block a member from logging in, or let them back in.
 *
 * Blocking does two things, and the second is the one people forget: it sets
 * the flag *and* revokes every session. Without that, a blocked member stays
 * signed in wherever they already are — for up to the idle window — and the
 * block only takes effect the next time they would have had to log in anyway.
 *
 * Unblocking deliberately does not restore those sessions. They were ended;
 * the way back in is the front door.
 *
 * `login_disabled` is sidecar-only and the DAV sync does not touch it, so a
 * block survives the next sync. (The sync sets it *on* for members who vanish
 * from DAV — see `server/helpers/sync.ts` — which is the same flag meaning the
 * same thing.)
 */

const bodySchema = z.object({
  blocked: z.boolean(),
  /** Free text for the chronicle. Not shown to the member. */
  reason: z.string().trim().max(500).optional(),
})

export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)

  const uid = getRouterParam(event, 'uid')
  if (!uid) {
    throw createError({ statusCode: 400, statusMessage: 'Missing uid' })
  }

  const { blocked, reason } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const target = (
    await db.select({ uid: users.uid }).from(users).where(eq(users.uid, uid)).limit(1)
  )[0]
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }

  // An admin who blocks themselves locks themselves out of the page they are
  // standing on, and possibly the last admin out of the app entirely.
  if (uid === actor.uid && blocked) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot block yourself' })
  }

  await db.update(users).set({ loginDisabled: blocked }).where(eq(users.uid, uid))

  let revoked = 0
  if (blocked) {
    const result = await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userUid, uid), isNull(sessions.revokedAt)))
    revoked = result[0].affectedRows
  }

  await recordEvent({
    type: blocked ? 'admin.blocked' : 'admin.unblocked',
    userUid: uid,
    actorUid: actor.uid,
    meta: { ...(reason ? { reason } : {}), ...(blocked ? { revokedSessions: revoked } : {}) },
    event,
  })

  return { blocked, revokedSessions: revoked }
})
