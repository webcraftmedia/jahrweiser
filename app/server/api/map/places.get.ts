import { z } from 'zod'

import { loadPlaces, placesIn } from '../../helpers/memberMap'

import type { MapPlace } from '../../../shared/map'

/** How many places one request may ask for. */
const MAX_LIMIT = 600

const querySchema = z.object({
  minX: z.coerce.number(),
  minY: z.coerce.number(),
  maxX: z.coerce.number(),
  maxY: z.coerce.number(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(300),
})

/**
 * Towns, villages and Stadtteile inside a rectangle of the map, most important
 * first, so the map reads as a place rather than as a pattern.
 *
 * Separate from the aggregate because it answers a *view*, not a data set: the
 * client asks again when it has been panned or zoomed somewhere the last answer
 * did not cover. Behind the session like everything else on this page, though
 * there is nothing confidential in a list of village names.
 */
export default defineEventHandler(async (event): Promise<MapPlace[]> => {
  await requireUserSession(event)

  const box = querySchema.parse(getQuery(event))
  const places = await loadPlaces()
  if (!places) {
    // No artefact — the map still works, it just has no names on it. Logged
    // once per process by the areas endpoint; here an empty answer is enough.
    return []
  }

  return placesIn(places, box, box.limit)
})
