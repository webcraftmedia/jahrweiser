import { eq } from 'drizzle-orm'

import { useDb } from '../../db'
import { users } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const uid = (session.user as { uid?: string }).uid
  if (!uid) {
    throw createError({ statusCode: 401, statusMessage: 'No user context' })
  }

  const db = useDb()
  const row = (
    await db
      .select({ newsletterSubscribed: users.newsletterSubscribed })
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1)
  )[0]

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  return {
    // Three states mapped to a simple bool for the UI.
    // Phase 1 (opt-in): only `subscribed` returns true.
    // Phase 2 (opt-out): everything except `unsubscribed` returns true.
    subscribed: row.newsletterSubscribed === 'subscribed',
    explicit: row.newsletterSubscribed !== null,
  }
})
