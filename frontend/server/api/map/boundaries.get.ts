import { z } from 'zod'

import { BOUNDARY_LEVELS, resolutionFor } from '../../../shared/map'
import { boundaryLayerIn, loadBoundaries } from '../../helpers/memberMap'

import type { MapBoundaries } from '../../../shared/map'

/**
 * How much border one request may be answered with.
 *
 * A view that is asked for the whole country's Kreise would otherwise be a
 * megabyte of path data — and the client never asks for that, because the
 * district layer only exists at zooms where a few hundred arcs are in view. The
 * limit is what keeps a hand-made request from being expensive; since the
 * artefact is sorted longest first, hitting it costs the specks.
 */
const MAX_ARCS = 6000
/** Names are cheap, but a wall of them is not a map. */
const MAX_LABELS = 80

const querySchema = z.object({
  minX: z.coerce.number(),
  minY: z.coerce.number(),
  maxX: z.coerce.number(),
  maxY: z.coerce.number(),
  /**
   * viewBox units per CSS pixel, as the map is actually drawn. The client is
   * the only party that knows how big a pixel is, so it says — and the answer
   * carries the coarsest copy whose error stays under a pixel. See
   * `resolutionFor`.
   */
  perPixel: z.coerce.number().min(0).default(0),
  /** Which levels the view has room for — the client decides, by its zoom. */
  levels: z
    .string()
    .default(BOUNDARY_LEVELS.join(','))
    // Deduplicated here rather than guarded against: a level named twice is a
    // request for it, not a mistake to refuse.
    .transform((value) => [...new Set(value.split(',').map((part) => part.trim()))])
    .pipe(z.array(z.enum(BOUNDARY_LEVELS)).min(1)),
})

/**
 * Bundesland and Kreis borders inside a rectangle of the map.
 *
 * Answers a *view*, like the place names and unlike the aggregate: the whole
 * Kreis network is some hundred kilobytes, and a reader zoomed into one corner
 * of the country has no use for the rest of it. The client asks again when it
 * has been panned or zoomed out of what the last answer covered.
 *
 * Behind the session like everything else on this page, though there is nothing
 * confidential about where Hessen ends.
 */
export default defineEventHandler(async (event): Promise<MapBoundaries> => {
  await requireUserSession(event)

  const query = querySchema.parse(getQuery(event))
  const boundaries = await loadBoundaries()
  // No artefact — the map still works, it just has nothing to orient by. The
  // areas endpoint logs the missing build once per process; here an empty
  // answer is enough.
  if (!boundaries) return {}

  const resolution = resolutionFor(query.perPixel)
  const answer: MapBoundaries = {}
  for (const level of query.levels) {
    answer[level] = boundaryLayerIn(
      boundaries.levels[level],
      query,
      MAX_ARCS,
      MAX_LABELS,
      resolution,
    )
  }
  return answer
})
