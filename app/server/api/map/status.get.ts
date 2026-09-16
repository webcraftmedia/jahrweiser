import { eq } from 'drizzle-orm'

import { useDb } from '../../db'
import { users } from '../../db/schema'
import { loadPlzAreas, lookupPostalCode } from '../../helpers/memberMap'

/**
 * Whether the map can place the current member.
 *
 * Not "is the column filled": a code the geometry does not know places nobody,
 * and `/api/map/members` refuses for it exactly as it does for an empty one —
 * so the rail's marker has to mean the same thing, or it would clear itself for
 * a member who still cannot see the map. The settings form refuses to store
 * such a code; one can still arrive from a DAV client, which is the case this
 * catches.
 *
 * The icon rail asks this on every page, so it stays a single primary-key
 * lookup and deliberately carries no map data. The geometry it checks against
 * is parsed once per process and kept.
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

  const geometry = await loadPlzAreas()
  if (!geometry) {
    // No artefact in this deployment — see docu/karte.md. The map page will say
    // so loudly; the rail falls back to the question it can still answer, so a
    // member with a postal code is not told theirs is missing.
    return { hasPostalCode: Boolean(row?.postalCode?.trim()) }
  }

  return { hasPostalCode: lookupPostalCode(row?.postalCode, geometry) !== null }
})
