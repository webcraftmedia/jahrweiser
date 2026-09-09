import { loadPlzAreas } from '../../helpers/memberMap'

import type { MapOutline } from '../../../shared/map'

/**
 * The country silhouette and the coordinate system every other path is in.
 *
 * Served from the same artefact as the areas rather than as a cacheable static
 * file. It used to be the latter, until a build changed the map's extent and
 * browsers holding yesterday's coordinate system drew today's areas a few
 * kilometres off. One source, one coordinate system.
 *
 * Not behind the postal-code gate, only behind the session: the locked preview
 * needs a country to blur, and an outline of Germany gives nothing away.
 */
export default defineEventHandler(async (event): Promise<MapOutline> => {
  await requireUserSession(event)

  const geometry = await loadPlzAreas()
  if (!geometry) {
    console.error('[map] no postal-code geometry found — run `npm run map:build`')
    throw createError({ statusCode: 500, statusMessage: 'Map data unavailable' })
  }

  return { viewBox: geometry.viewBox, d: geometry.outline }
})
