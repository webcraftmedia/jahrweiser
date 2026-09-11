import { and, count as countRows, eq, isNull, ne } from 'drizzle-orm'

import { useDb } from '../../db'
import { users } from '../../db/schema'
import { buildMapPayload, loadPlzAreas, lookupPostalCode } from '../../helpers/memberMap'

import type { MapPayload } from '../../../shared/map'

/**
 * The aggregated member map: one number per postal code, never a name and never
 * a single member's location.
 *
 * Gated twice on purpose. `requireUserSession` keeps it inside the membership,
 * and members the map cannot place get a 403 with no data at all — the blurred
 * preview the page shows them is drawn from made-up numbers on the client.
 * Sending the real thing and blurring it in CSS would hand it to anyone who
 * opens the network tab.
 *
 * "Cannot place" covers an empty postal code *and* one the geometry does not
 * know. The trade is the map's own: you are on it or you do not see it, and a
 * typo that puts nobody on the map must not buy the whole aggregate either.
 */
export default defineEventHandler(async (event): Promise<MapPayload> => {
  const session = await requireUserSession(event)
  const uid = session.user.uid
  if (!uid) {
    throw createError({ statusCode: 401, statusMessage: 'No user context' })
  }

  const geometry = await loadPlzAreas()
  if (!geometry) {
    // No artefact in this deployment — see docu/karte.md. Worth a 500: the page
    // cannot draw anything, and an operator should see why in the log. Checked
    // before the gate below, which needs the geometry to judge anything.
    console.error('[map] no postal-code geometry found — run `npm run map:build`')
    throw createError({ statusCode: 500, statusMessage: 'Map data unavailable' })
  }

  const db = useDb()
  const me = (
    await db.select({ postalCode: users.postalCode }).from(users).where(eq(users.uid, uid)).limit(1)
  )[0]
  if (!lookupPostalCode(me?.postalCode, geometry)) {
    throw createError({ statusCode: 403, statusMessage: 'postal-code-required' })
  }

  // Deleted members keep their row until the 30-day GC removes it; they are
  // gone from the association and must not show up on the map.
  const rows = await db
    .select({ postalCode: users.postalCode, count: countRows() })
    .from(users)
    .where(and(isNull(users.deletedAt), ne(users.postalCode, '')))
    .groupBy(users.postalCode)

  const totals = await db.select({ count: countRows() }).from(users).where(isNull(users.deletedAt))

  return buildMapPayload(rows, geometry, totals[0]?.count ?? 0)
})
