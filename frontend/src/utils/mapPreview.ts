import type { MapArea, MapOutline } from '~~/shared/map'

/**
 * The made-up map shown, blurred, to members who have not given their own
 * postal code yet.
 *
 * The numbers are invented here on the client because the server sends nothing
 * at all in that case — blurring the real aggregate would put it one devtools
 * tab away from anyone. Fixed rather than random so the preview does not
 * shimmer on every render, and so a test can assert on it.
 *
 * Positions are fractions of the map's bounding box, picked to sit inside the
 * country. No geometry: the preview draws dots on the silhouette, which is all
 * that survives a blur anyway.
 */
const PREVIEW_POINTS: { x: number; y: number; count: number }[] = [
  { x: 0.45, y: 0.06, count: 2 },
  { x: 0.41, y: 0.14, count: 9 },
  { x: 0.33, y: 0.19, count: 3 },
  { x: 0.61, y: 0.09, count: 1 },
  { x: 0.38, y: 0.29, count: 5 },
  { x: 0.72, y: 0.24, count: 12 },
  { x: 0.21, y: 0.37, count: 4 },
  { x: 0.63, y: 0.4, count: 3 },
  { x: 0.16, y: 0.45, count: 7 },
  { x: 0.75, y: 0.45, count: 2 },
  { x: 0.31, y: 0.55, count: 18 },
  { x: 0.52, y: 0.57, count: 1 },
  { x: 0.34, y: 0.72, count: 6 },
  { x: 0.53, y: 0.68, count: 4 },
  { x: 0.24, y: 0.82, count: 2 },
  { x: 0.56, y: 0.85, count: 8 },
]

/**
 * Preview areas laid out over `outline`'s coordinate system. Takes the outline
 * rather than two numbers so the page has nothing to unpack — and no branch to
 * take — before the silhouette has arrived.
 */
export function previewAreas(outline: MapOutline | null): MapArea[] {
  const [, , parsedWidth, parsedHeight] = (outline?.viewBox ?? '').split(/\s+/).map(Number)
  const width = parsedWidth || 1
  const height = parsedHeight || 1
  return PREVIEW_POINTS.map((point, index) => ({
    // Not a real postal code — nothing reads it, the preview has no table and
    // no tooltip, but the key has to be stable and unique.
    plz: `preview-${index}`,
    ort: '',
    count: point.count,
    d: '',
    cx: Math.round(point.x * width),
    cy: Math.round(point.y * height),
    size: 0,
  }))
}
