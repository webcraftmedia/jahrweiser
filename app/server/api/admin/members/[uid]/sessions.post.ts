import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { sessions, users } from '~~/server/db/schema'
import { recordEvent } from '~~/server/helpers/events'
import { requireAdmin } from '~~/server/helpers/requireAdmin'

/**
 * End a member's sessions — one of them, or all of them.
 *
 * What an admin reaches for when a phone was lost or a shared device was used,
 * and the one thing the app could not do until now: the logout in the header
 * clears the cookie in *that* browser and nothing else. Naming a single session
 * is for the ordinary case — one forgotten device, while the member stays
 * signed in on the one they are holding.
 *
 * Revoking rather than deleting: `revokedAt` is what the session-check
 * middleware reads, and the row staying behind is what lets the member's
 * chronicle show that somebody ended it, rather than the session merely
 * vanishing.
 */

const bodySchema = z.object({
  /** One session, by id. Absent means all of them. */
  sessionId: z.string().min(1).max(64).optional(),
})
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)

  const uid = getRouterParam(event, 'uid')
  if (!uid) {
    throw createError({ statusCode: 400, statusMessage: 'Missing uid' })
  }

  const { sessionId } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const target = (
    await db.select({ uid: users.uid }).from(users).where(eq(users.uid, uid)).limit(1)
  )[0]
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }

  // Scoped to the member either way: a session id from one member's page must
  // never be able to end somebody else's session.
  const scope = [eq(sessions.userUid, uid), isNull(sessions.revokedAt)]
  if (sessionId !== undefined) scope.push(eq(sessions.id, sessionId))

  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(...scope))
  const revoked = result[0].affectedRows

  await recordEvent({
    type: 'admin.sessions_revoked',
    userUid: uid,
    actorUid: actor.uid,
    meta: { revokedSessions: revoked, scope: sessionId === undefined ? 'all' : 'one' },
    event,
  })

  return { revokedSessions: revoked }
})
