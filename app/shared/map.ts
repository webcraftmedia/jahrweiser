// Types shared by the member-map endpoint, the page and the build script that
// produces the geometry artefacts (scripts/build-map-data.ts).
//
// All coordinates are in the units of one fixed viewBox, computed once at build
// time from a spherical Mercator projection of Germany. Nothing is projected at
// runtime: the server hands out ready-made SVG path data, the client draws it.

/** Attribution the map has to display — ODbL requires naming the source. */
export const MAP_ATTRIBUTION =
  'Gebiete und Grenzen: © OpenStreetMap-Mitwirkende (ODbL) · Orte: GeoNames (CC BY 4.0)'

/** One postal-code area, together with how many members live in it. */
export interface MapArea {
  /** Five-digit German postal code. */
  plz: string
  /** Place name(s) for that postal code, as carried by the source data. */
  ort: string
  /** Number of members whose profile carries this postal code. */
  count: number
  /** SVG path data for the area, in viewBox units. */
  d: string
  /** Label anchor and marker centre (the area's centroid), in viewBox units. */
  cx: number
  cy: number
  /**
   * The area's size in square viewBox units. City postal codes are geometrically
   * tiny at country scale — the client uses this to decide when a shape needs an
   * extra marker to stay visible.
   */
  size: number
}

/** What `GET /api/map/members` answers once the map is unlocked. */
export interface MapPayload {
  areas: MapArea[]
  /** Members whose postal code matched no area (typo, or outside Germany). */
  unlocated: number
  /** Members carrying any postal code at all. */
  located: number
  /** Members in total, postal code or not. */
  total: number
  /** Largest `count` across all areas — the scale both colour and size use. */
  max: number
}

/**
 * The country silhouette and the coordinate system everything is drawn in.
 *
 * The two travel together on purpose. They used to be a cacheable static file
 * while the areas came from the API — and the day the build changed the extent,
 * a browser holding yesterday's viewBox drew today's areas in the wrong places.
 * One artefact, one coordinate system, no way for them to disagree.
 */
export interface MapOutline {
  /** `"0 0 <width> <height>"` — the coordinate system every path lives in. */
  viewBox: string
  /** The silhouette as one path. */
  d: string
}

/**
 * The projection the whole map lives in, recorded so a later run can put new
 * geometry into the *same* coordinate system without re-reading the half a
 * gigabyte of postal-code input the extent was originally fitted to.
 *
 * Mercator x/y → viewBox units is `[(x - x0) * k, (y0 - y) * k]`.
 */
export interface MapProjection {
  /** Mercator x of the left edge. */
  x0: number
  /** Mercator y of the top edge. */
  y0: number
  /** viewBox units per Mercator unit. */
  k: number
}

/** The artefact `scripts/build-map-data.ts` writes to `server/assets/map/`. */
export interface PlzAreaFile {
  viewBox: string
  /** The country silhouette, in the same coordinate system. */
  outline: string
  /** Keyed by postal code. */
  areas: Record<string, { o: string; d: string; c: [number, number]; s: number }>
  /** Absent in artefacts built before the administrative borders landed. */
  proj?: MapProjection
}

/**
 * The administrative levels the map draws borders for, coarsest first.
 *
 * Not the OSM numbers (`admin_level` 4 and 6) anywhere but in the build script:
 * what the client asks for is a level of *orientation*, and the day a level is
 * added for a different country the number would be wrong, not the name.
 */
export const BOUNDARY_LEVELS = ['state', 'district'] as const
export type BoundaryLevel = (typeof BOUNDARY_LEVELS)[number]

/**
 * One stretch of administrative border: a bounding box and the path itself.
 *
 * The unit is the *arc*, not the area — borders are stroked and never filled, so
 * the border two districts share may be stored once instead of twice. In OSM it
 * literally is one way, carried by both relations, so deduplicating it by way id
 * costs nothing and buys three things: half the artefact, a box to cull against,
 * and the guarantee that the two neighbours cannot disagree about where their
 * common border runs (the sliver problem the postal-code areas needed a whole
 * topology stage for — see docu/karte.md).
 */
export type BoundaryArc = [minX: number, minY: number, maxX: number, maxY: number, d: string]

/**
 * How coarse the second copy of every border is, in viewBox units (4 ≈ 212 m).
 *
 * A wide view cannot show 53 m of detail and pays dearly for carrying it:
 * Firefox spends **45 ms** parsing the full state layer against 3 ms for this
 * one, blocking the main thread every time the map is zoomed out far enough to
 * fetch the country. Nine times fewer vertices, and at the scale it is served
 * at, not a pixel of difference.
 */
export const COARSE_TOLERANCE = 4

/**
 * And a third copy between the two, at **one grid unit** — 53 m, the width of
 * the quantisation the whole map is built on.
 *
 * Two stages turned out to be a cliff rather than a staircase. Between them
 * sits a factor of nine in vertices, and it fell in exactly the wrong place:
 * the Kreis layer fades in at a scale where `perPixel` is 2 to 4, so the layer
 * became visible and nine times finer within one press of the zoom button.
 * Measured there, panning cost **1,25 s of main thread** and dropped sixteen
 * frames of fifty.
 *
 * The tolerance is not a compromise picked for size. It is the floor of what
 * the coordinate system can express at all: every vertex is rounded to a whole
 * unit, so no line can be truer than one unit anyway (see "The 53 m grid is the
 * floor" in docu/karte.md). What this drops is detail the artefact only appears
 * to have — and it drops two thirds of the vertices doing it.
 */
export const MEDIUM_TOLERANCE = 1

/** The resolutions a border layer is stored at, finest first. */
export const BOUNDARY_RESOLUTIONS = ['fine', 'medium', 'coarse'] as const
export type BoundaryResolution = (typeof BOUNDARY_RESOLUTIONS)[number]

/**
 * Which copy a view drawing at `perPixel` viewBox units per CSS pixel should
 * get: the coarsest whose error stays under one pixel.
 *
 * Each threshold is its own tolerance, which is what "under a pixel" means —
 * a copy simplified to `t` units strays at most `t` units, so at `perPixel > t`
 * that is less than a pixel on screen and there is nothing to see.
 *
 * The client is the only party that knows how big a pixel is, so it sends the
 * number and both sides run this. A rule based on the requested box would have
 * had to guess at a screen size and would be wrong on a phone and on a wall
 * display alike.
 */
export function resolutionFor(perPixel: number): BoundaryResolution {
  if (perPixel > COARSE_TOLERANCE) return 'coarse'
  if (perPixel > MEDIUM_TOLERANCE) return 'medium'
  return 'fine'
}

/** The artefact holding the administrative borders. */
export interface BoundaryFile {
  viewBox: string
  proj: MapProjection
  levels: Record<
    BoundaryLevel,
    {
      /** Longest first, so a truncated answer drops the least visible lines. */
      arcs: BoundaryArc[]
      /**
       * The same borders at `MEDIUM_TOLERANCE`. Optional: an artefact built
       * before this stage existed has none, and the endpoint then falls back to
       * the geometry it does have rather than answering with nothing.
       */
      medium?: BoundaryArc[]
      /** The same borders at `COARSE_TOLERANCE`, for views that cannot show more. */
      coarse: BoundaryArc[]
      /** `[x, y, size, name]`, largest first. */
      labels: [number, number, number, string][]
    }
  >
}

/** One administrative name on the map. */
export interface MapBoundaryLabel {
  name: string
  x: number
  y: number
  /** The area's size in square viewBox units — decides who gets the space. */
  size: number
}

/** What one level contributes to the current view. */
export interface MapBoundaryLayer {
  /** Every arc in view, joined into a single path. */
  d: string
  labels: MapBoundaryLabel[]
}

/** What `GET /api/map/boundaries` answers: one layer per level asked for. */
export type MapBoundaries = Partial<Record<BoundaryLevel, MapBoundaryLayer>>

/**
 * Towns, villages and Stadtteile, so the map reads as a place and not as a
 * pattern. Tuples rather than objects: there are eighty thousand of them, and
 * the field names would be most of the file.
 */
export interface PlaceFile {
  viewBox: string
  /** `[x, y, rank, name]`, most important first. */
  places: [number, number, number, string][]
}

/**
 * What `GET /api/map/postal-code` answers — "does the map know this code, and
 * which place is it?". The settings form asks while the member types, so it can
 * name the town back at them instead of only refusing what is wrong.
 */
export interface PostalCodeLookup {
  /** True when the geometry holds an area for this code. */
  known: boolean
  /** The five digits, or null when the input is not a German postal code. */
  plz: string | null
  /** The place the code names, or null when it is not known. */
  ort: string | null
}

/** One place label, as the map endpoint hands it to the client. */
export interface MapPlace {
  name: string
  x: number
  y: number
  /** Population, or a nominal figure for its kind — decides who gets shown. */
  rank: number
}
