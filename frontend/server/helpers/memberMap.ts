import type {
  BoundaryFile,
  BoundaryLevel,
  MapArea,
  MapBoundaryLabel,
  MapBoundaryLayer,
  MapPayload,
  MapPlace,
  PlaceFile,
  PlzAreaFile,
} from '../../shared/map'

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

/** Where the administrative borders live, next to the areas. */
export const BOUNDARY_FILE_KEY = 'map/boundaries.json'

/** The border artefact, parsed once and kept. */
let boundaryCache: BoundaryFile | null = null

/** Read the border artefact. Null when it has not been generated. */
export async function loadBoundaries(): Promise<BoundaryFile | null> {
  if (boundaryCache) return boundaryCache
  const raw = await useStorage('assets:server').getItem<BoundaryFile>(BOUNDARY_FILE_KEY)
  if (!raw?.levels) return null
  // What comes off disk is data, not a value the type system watched being
  // built: an artefact generated before a level existed, or by a run that was
  // given no Kreis input, simply has no key for it. Filled in once here, so
  // that no reader has to ask.
  const stored = raw.levels as Partial<BoundaryFile['levels']>
  const empty = { arcs: [], coarse: [], labels: [] }
  boundaryCache = {
    ...raw,
    levels: {
      state: { ...empty, ...stored.state },
      district: { ...empty, ...stored.district },
    },
  }
  return boundaryCache
}

/** A rectangle in viewBox units. */
export interface MapBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * The borders of one administrative level that reach into `box`.
 *
 * The unit is the arc, not the area, so the answer is exactly the ink the view
 * needs: an arc is in or out by its own bounding box, and the ones that survive
 * are concatenated into a single path — a border is stroked, never filled, so
 * nothing depends on where one arc ends and the next begins.
 *
 * Both lists are sorted longest/largest first in the artefact, which is what
 * makes the limits safe: an answer that hits one drops the specks, not the line
 * that crosses the whole view.
 */
export function boundaryLayerIn(
  level: BoundaryFile['levels'][BoundaryLevel],
  box: MapBox,
  limit: number,
  labelLimit: number,
  coarse = false,
): MapBoundaryLayer {
  const arcs: string[] = []
  // A view that cannot show 53 m of detail should not be made to parse it —
  // see COARSE_ABOVE. An artefact built before the coarse copy existed has none,
  // and answers with the geometry it does have.
  const drawn = coarse && level.coarse.length > 0 ? level.coarse : level.arcs
  for (const [minX, minY, maxX, maxY, d] of drawn) {
    if (maxX < box.minX || minX > box.maxX || maxY < box.minY || minY > box.maxY) continue
    arcs.push(d)
    if (arcs.length >= limit) break
  }

  const labels: MapBoundaryLabel[] = []
  for (const [x, y, size, name] of level.labels) {
    if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) continue
    labels.push({ name, x, y, size })
    if (labels.length >= labelLimit) break
  }

  return { d: arcs.join(''), labels }
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
  boundaryCache = null
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

/**
 * Resolve a stored or typed postal code to the area it names, or null.
 *
 * This is the single definition of "valid postal code" in the app: five digits
 * that the geometry actually knows. The settings form refuses anything else,
 * the map's gate opens for nothing else, and the rail's marker means exactly
 * this and nothing else — a code that is merely *present* is no use to a member
 * whose point the map cannot draw.
 */
export function lookupPostalCode(
  value: string | null | undefined,
  geometry: LoadedAreas,
): { plz: string; ort: string } | null {
  const plz = normalisePostalCode(value)
  if (!plz) return null
  const area = geometry.areas.get(plz)
  return area ? { plz, ort: area.o } : null
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
