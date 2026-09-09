import { eq } from 'drizzle-orm'

import { useDb } from '../../db'
import { users } from '../../db/schema'

/**
 * Whether the current member has a postal code on file.
 *
 * The icon rail asks this on every page to decide whether to mark its map entry
 * as incomplete, so it stays a single primary-key lookup and deliberately does
 * not carry any map data. Reading it from the sidecar rather than from the
 * session keeps it honest when the code was changed in a DAV client and only
 * the daily sync knows about it.
 */
export default defineEventHandler(async (event): Promise<{ hasPostalCode: boolean }> => {
  const session = await requireUserSession(event)
  const uid = session.user.uid
  if (!uid) {
    throw createError({ statusCode: 401, statusMessage: 'No user context' })
  }

  const db = useDb()
  const row = (
    await db.select({ postalCode: users.postalCode }).from(users).where(eq(users.uid, uid)).limit(1)
  )[0]

  return { hasPostalCode: Boolean(row?.postalCode?.trim()) }
})
