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
    subscribed: row.newsletterSubscribed === 'subscribed',
    explicit: row.newsletterSubscribed !== null,
  }
})
