import { eq } from 'drizzle-orm'

import { useDb } from '../db'
import { sessions } from '../db/schema'

const LAST_SEEN_THROTTLE_MS = 60_000

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  // nuxt-auth-utils stores the session id under top-level `id`; we reuse it
  // as the PK of our sessions table (set in redeemLoginLink). The middleware
  // only acts on authenticated requests — anonymous sessions still have an id
  // but no `user`, and we leave those alone.
  const sessionId = (session as { id?: string }).id
  if (!sessionId || !(session as { user?: unknown }).user) return

  const db = useDb()
  const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0]

  const now = Date.now()
  const isInvalid = row?.revokedAt !== null || row.expiresAt.getTime() < now

  if (isInvalid) {
    // Clear the cookie so subsequent requests are clean, AND throw 401 for
    // this request — clearUserSession alone doesn't propagate within the
    // same request to downstream `requireUserSession` calls.
    await clearUserSession(event)
    if (event.path.startsWith('/api/')) {
      throw createError({ statusCode: 401, statusMessage: 'Session invalid' })
    }
    return
  }

  const lastSeen = row.lastSeenAt?.getTime() ?? 0
  if (now - lastSeen > LAST_SEEN_THROTTLE_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(now) })
      .where(eq(sessions.id, sessionId))
  }
})
