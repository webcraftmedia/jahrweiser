import { and, eq, isNull } from 'drizzle-orm'

import { useDb } from '~~/server/db'
import { sessions, users } from '~~/server/db/schema'
import { recordEvent } from '~~/server/helpers/events'
import { requireAdmin } from '~~/server/helpers/requireAdmin'

/**
 * End every session a member has — "log them out everywhere".
 *
 * What an admin reaches for when a phone was lost or a shared device was used,
 * and the one thing the app could not do until now: the logout in the header
 * clears the cookie in *that* browser and nothing else.
 *
 * Revoking rather than deleting: `revokedAt` is what the session-check
 * middleware reads, and the row staying behind is what lets the member's
 * chronicle show that somebody ended it, rather than the session merely
 * vanishing.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)

  const uid = getRouterParam(event, 'uid')
  if (!uid) {
    throw createError({ statusCode: 400, statusMessage: 'Missing uid' })
  }

  const db = useDb()
  const target = (
    await db.select({ uid: users.uid }).from(users).where(eq(users.uid, uid)).limit(1)
  )[0]
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }

  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userUid, uid), isNull(sessions.revokedAt)))
  const revoked = result[0].affectedRows

  await recordEvent({
    type: 'admin.sessions_revoked',
    userUid: uid,
    actorUid: actor.uid,
    meta: { revokedSessions: revoked },
    event,
  })

  return { revokedSessions: revoked }
})
