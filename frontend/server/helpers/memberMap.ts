import type { MapArea, MapPayload, MapPlace, PlaceFile, PlzAreaFile } from '../../shared/map'

/**
 * The member map's server side: it holds the geometry for all ~8.200 German
 * postal codes and hands the client only the handful of areas that actually
 * have members in them. That subsetting is the whole reason the geometry lives
 * here and not in the bundle — the full set is megabytes, a member association
 * covers a few dozen codes.
 */

/** The area file, parsed once and kept — it never changes at runtime. */
let cache: LoadedAreas | null = null

export interface LoadedAreas {
  viewBox: string
  /** The country silhouette, in the same coordinate system as the areas. */
  outline: string
  /** A Map rather than the file's plain object: keyed lookups with data-derived
   *  keys, and no prototype to fall through to. */
  areas: Map<string, PlzAreaFile['areas'][string]>
}

/** Where `scripts/build-map-data.ts` puts its output, inside `server/assets`. */
export const AREA_FILE_KEY = 'map/plz-areas.json'

/**
 * Read the geometry artefact. Returns null when it has not been generated yet —
 * a fresh checkout has no map data, and that must not take the app down.
 */
export async function loadPlzAreas(): Promise<LoadedAreas | null> {
  if (cache) return cache
  const raw = await useStorage('assets:server').getItem<PlzAreaFile>(AREA_FILE_KEY)
  if (!raw?.areas) return null
  cache = {
    viewBox: raw.viewBox,
    outline: raw.outline,
    areas: new Map(Object.entries(raw.areas)),
  }
  return cache
}

/** Where the place labels live, next to the areas. */
export const PLACE_FILE_KEY = 'map/places.json'

/** The place list, parsed once and kept — like the areas, it never changes. */
let placeCache: PlaceFile['places'] | null = null

/** Read the place artefact. Null when it has not been generated. */
export async function loadPlaces(): Promise<PlaceFile['places'] | null> {
  if (placeCache) return placeCache
  const raw = await useStorage('assets:server').getItem<PlaceFile>(PLACE_FILE_KEY)
  if (!raw?.places) return null
  placeCache = raw.places
  return placeCache
}

/** A rectangle in viewBox units. */
export interface MapBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * The `limit` most important places inside `box`.
 *
 * The artefact is sorted by rank, so the first matches found are the ones worth
 * showing — a scan that stops at the limit does not have to look at the eighty
 * thousand behind them. What the client then actually draws is fewer still: it
 * fills the space it has, biggest first, which is what makes a village's name
 * appear only once somebody zooms in far enough for it to fit.
 */
export function placesIn(places: PlaceFile['places'], box: MapBox, limit: number): MapPlace[] {
  const found: MapPlace[] = []
  for (const [x, y, rank, name] of places) {
    if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) continue
    found.push({ name, x, y, rank })
    if (found.length >= limit) break
  }
  return found
}

/** Drop the cached artefacts — for tests. */
export function resetPlzAreaCache(): void {
  cache = null
  placeCache = null
}

/**
 * The five digits of a German postal code, or null. Members type their code by
 * hand and DAV clients round-trip it, so "D-64673" and "64 673" both turn up;
 * anything that is not five digits (a foreign code, a typo) has no area and is
 * reported as unlocated rather than silently dropped.
 */
export function normalisePostalCode(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.length === 5 ? digits : null
}

/** One row of the `GROUP BY postal_code` the endpoint runs. */
export interface PostalCodeCount {
  postalCode: string | null
  count: number
}

/**
 * Join the member counts onto the geometry. Counts for a postal code without an
 * area are added up in `unlocated` — the page shows that number, because a map
 * that quietly loses people is worse than one that admits it.
 */
export function buildMapPayload(
  rows: PostalCodeCount[],
  geometry: LoadedAreas,
  total: number,
): MapPayload {
  const counts = new Map<string, number>()
  let located = 0
  let unlocated = 0

  for (const row of rows) {
    const count = row.count
    if (count <= 0) continue
    located += count
    const plz = normalisePostalCode(row.postalCode)
    const area = plz ? geometry.areas.get(plz) : undefined
    if (!plz || !area) {
      unlocated += count
      continue
    }
    // Two spellings of the same code ("64673" and "D-64673") collapse here.
    counts.set(plz, (counts.get(plz) ?? 0) + count)
  }

  const areas: MapArea[] = [...counts.entries()]
    .map(([plz, count]) => {
      // Present by construction — `counts` only ever gets keys that resolved.
      const area = geometry.areas.get(plz) as PlzAreaFile['areas'][string]
      return { plz, ort: area.o, count, d: area.d, cx: area.c[0], cy: area.c[1], size: area.s }
    })
    // Most members first: that is the order the accessible table reads in, and
    // the component re-sorts for painting.
    .sort((a, b) => b.count - a.count || a.plz.localeCompare(b.plz))

  return {
    areas,
    unlocated,
    located,
    total,
    max: areas.reduce((max, area) => Math.max(max, area.count), 0),
  }
}
