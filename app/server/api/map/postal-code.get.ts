import { z } from 'zod'

import { loadPlzAreas, lookupPostalCode } from '../../helpers/memberMap'

import type { PostalCodeLookup } from '../../../shared/map'

const querySchema = z.object({
  // Same lenient bound as the profile body: what arrives here is what somebody
  // is typing, and the answer to "64673xxxx" is "no", not a validation error.
  plz: z.string().trim().max(16),
})

/**
 * Does the map know this postal code, and which place is it?
 *
 * The settings form asks while the member types, so it can confirm the town
 * ("64625 — Bensheim") rather than only refuse what is wrong — a code that is
 * five digits and real but a hundred kilometres off is exactly the mistake a
 * pure format check cannot catch.
 *
 * A lookup and not a resource: an unknown code is a 200 with `known: false`,
 * not a 404. The form renders it as a field state, and a rejected promise there
 * would be indistinguishable from the endpoint being down — which has to stay
 * *harmless*, see the 500 below.
 *
 * There is nothing to leak: the geometry is public OpenStreetMap data, and the
 * session is required only because everything on the map is.
 */
export default defineEventHandler(async (event): Promise<PostalCodeLookup> => {
  await requireUserSession(event)

  const { plz } = querySchema.parse(getQuery(event))
  const geometry = await loadPlzAreas()
  if (!geometry) {
    // No artefact in this deployment — see docu/karte.md. The form treats a
    // failed lookup as "could not check" and keeps saving possible, the same
    // fallback the POST makes, so a missing artefact never locks the profile.
    console.error('[map] no postal-code geometry found — run `npm run map:build`')
    throw createError({ statusCode: 500, statusMessage: 'Map data unavailable' })
  }

  const match = lookupPostalCode(plz, geometry)
  return { known: match !== null, plz: match?.plz ?? null, ort: match?.ort ?? null }
})
