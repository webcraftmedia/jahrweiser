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

/** The artefact `scripts/build-map-data.ts` writes to `server/assets/map/`. */
export interface PlzAreaFile {
  viewBox: string
  /** The country silhouette, in the same coordinate system. */
  outline: string
  /** Keyed by postal code. */
  areas: Record<string, { o: string; d: string; c: [number, number]; s: number }>
}

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

/** One place label, as the map endpoint hands it to the client. */
export interface MapPlace {
  name: string
  x: number
  y: number
  /** Population, or a nominal figure for its kind — decides who gets shown. */
  rank: number
}
