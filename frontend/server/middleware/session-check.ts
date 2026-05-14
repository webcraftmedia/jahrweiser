import { eq } from 'drizzle-orm'

import { useDb } from '../db'
import { sessions } from '../db/schema'

const LAST_SEEN_THROTTLE_MS = 60_000

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const sessionId = (session as { sessionId?: string }).sessionId
  if (!sessionId) return

  const db = useDb()
  const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0]

  const now = Date.now()
  const isInvalid = row?.revokedAt !== null || row.expiresAt.getTime() < now

  if (isInvalid) {
    await clearUserSession(event)
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
