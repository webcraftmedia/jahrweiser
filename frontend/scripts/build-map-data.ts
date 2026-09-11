/**
 * Turns the German postal-code polygons into the two artefacts the member map
 * draws from. Run by hand, output committed — the app never fetches geodata at
 * build or run time.
 *
 *   npm run map:build -- --in /tmp/plz.geojson --names /tmp/DE.txt
 *
 * Inputs (see docu/karte.md for where to get them):
 *   --in     `postleitzahlen.geojson` from yetzt/postleitzahlen — the postal-code
 *            boundaries of OpenStreetMap, ODbL. Features carry a `postcode`
 *            property and nothing else.
 *   --names  GeoNames' postal-code `DE.txt` (CC BY 4.0), a TSV of postal code →
 *            place name. Optional: without it the areas have no name in the tooltip.
 *   --places GeoNames' *dump* `DE.txt` (CC BY 4.0) — every populated place with
 *            its coordinates, kind and population. Optional; without it the map
 *            has no place names on it.
 *   --altnames GeoNames' `alternatenames/DE.txt` (CC BY 4.0). Strongly
 *            recommended: the dump names the big cities in *English*
 *            ("Munich", "Nuremberg"), and this is where the German ones are.
 *   --boundary  The German boundary relation as Overpass answers it (ODbL),
 *            from `rel(51477);out geom;`. Optional; without it, no silhouette.
 *
 * Output:
 *   server/assets/map/plz-areas.json  — the coordinate system, the country
 *       silhouette and every postal code. The endpoint sends the client the
 *       silhouette plus the handful of areas that actually have members in
 *       them, which is why the full set never has to be small.
 *   server/assets/map/places.json     — towns and villages, for the labels.
 *
 * Coordinates are projected once here (spherical Mercator) and quantised to
 * whole viewBox units, so the runtime never does trigonometry and the path data
 * stays short.
 *
 * The input is half a gigabyte of pretty-printed JSON — past the point where
 * `JSON.parse` can take it in one bite, since V8 caps a string at ~536 MB. It is
 * therefore streamed, one feature at a time, and read **twice**: once to find
 * the bounding box the projection needs, once to build the output. Holding the
 * projected geometry between the two passes would cost some 1.5 GB of heap;
 * reading the file again costs a few seconds.
 */
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { PlaceFile, PlzAreaFile } from '../shared/map'

/**
 * Width of the coordinate system. 12.000 units across Germany ≈ 53 m per unit.
 *
 * Finer than the country view needs, because the map opens fitted to where the
 * members actually are — a couple of hundred kilometres across, not a thousand —
 * and zooms in from there. At 53 m a vertex is under a pixel at four times that
 * zoom; at the 160 m an all-Germany view would justify, borders go visibly
 * blocky as soon as anyone looks closer.
 */
const VIEWBOX_WIDTH = 12_000

/**
 * Simplification tolerance for the areas, in viewBox units (1 ≈ 53 m, the grid
 * itself). Deliberately at the floor: the map can be zoomed well past the point
 * where a coarser tolerance turns a boundary into a staircase, and what it
 * costs is a server-side artefact a couple of megabytes larger.
 */
const DEFAULT_TOLERANCE = 1

/**
 * Simplification tolerance for the silhouette (3 ≈ 160 m).
 *
 * Coarser than the areas, because the silhouette is *context* and not a shape
 * anyone reads a value off. It used to be 6 ≈ 320 m on the grounds that the
 * national border is off screen at the zoom where that would show — which is
 * true of the border and false of the coast: the coast is where the silhouette
 * and the postal-code areas are drawn on top of each other, and 320 m of
 * simplification is most of why they visibly disagree there. They come from
 * different data and will never coincide exactly (see docu/karte.md), but the
 * part of the gap that is ours to fix is this number. It costs 13 kB.
 */
const OUTLINE_TOLERANCE = 3

/** Rings below this (in square viewBox units, ≈ 0.5 km²) are not islands. */
const MIN_OUTLINE_AREA = 200

type Point = [number, number]
type Ring = Point[]

interface Feature {
  /** OSM calls it `postcode`; other exports of the same data use `plz`. */
  properties: { postcode?: string; plz?: string; postal_code?: string }
  geometry: { type: string; coordinates: unknown } | null
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`
  const withEquals = process.argv.find((a) => a.startsWith(prefix))
  if (withEquals) return withEquals.slice(prefix.length)
  const idx = process.argv.indexOf(`--${name}`)
  return idx === -1 ? undefined : process.argv[idx + 1]
}

// --- reading ---------------------------------------------------------------

/**
 * Yield the members of the input's `features` array one at a time.
 *
 * A hand-rolled scanner rather than a streaming-JSON dependency: all it has to
 * do is find the array and then count braces, minding that a brace inside a
 * string is not a brace. The consumed prefix is dropped after every feature, so
 * the buffer never holds more than one feature plus one chunk.
 */
async function* streamFeatures(file: string): AsyncGenerator<Feature> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt vom Entwickler auf der Kommandozeile, nicht aus einer Anfrage
  const stream = createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 })
  let buffer = ''
  // Where in `buffer` scanning resumes. It has to survive the arrival of the
  // next chunk: a feature can be many chunks long, and rescanning what was
  // already counted would double every brace in it.
  let scan = 0
  let inArray = false
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for await (const chunk of stream) {
    buffer += chunk as string

    if (!inArray) {
      const key = buffer.indexOf('"features"')
      if (key === -1) continue
      const open = buffer.indexOf('[', key)
      if (open === -1) continue
      buffer = buffer.slice(open + 1)
      scan = 0
      inArray = true
    }

    while (scan < buffer.length) {
      const char = buffer[scan]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
      } else if (char === '"') {
        inString = true
      } else if (char === '{') {
        if (depth === 0) start = scan
        depth += 1
      } else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          yield JSON.parse(buffer.slice(start, scan + 1)) as Feature
          // Drop what was consumed, so the buffer never holds more than the
          // feature being read plus the chunk it arrived in.
          buffer = buffer.slice(scan + 1)
          scan = 0
          start = -1
          continue
        }
      } else if (char === ']' && depth === 0) {
        return
      }
      scan += 1
    }
    // Caught up with nothing half-read: the separators between features are of
    // no interest and would otherwise accumulate.
    if (depth === 0) {
      buffer = ''
      scan = 0
    }
  }
}

/**
 * Postal code → place name, from GeoNames' `DE.txt`.
 *
 * A code can carry several rows ("Dresden", "Dresden Friedrichstadt", …). The
 * shortest name is the one people would say — the longer ones are districts of
 * it, or, for the codes the post office hands to a single large recipient, a
 * company name that nobody would recognise as a place.
 */
async function loadPlaceNames(file: string): Promise<Map<string, string>> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt vom Entwickler auf der Kommandozeile, nicht aus einer Anfrage
  const text = await readFile(file, 'utf8')
  const names = new Map<string, string>()
  for (const line of text.split('\n')) {
    const fields = line.split('\t')
    const plz = (fields[1] ?? '').trim()
    const place = (fields[2] ?? '').trim()
    if (!plz || !place) continue
    const current = names.get(plz)
    if (!current || place.length < current.length) names.set(plz, place)
  }
  return names
}

/**
 * Places worth putting on a map, and what to rank them by when GeoNames has no
 * population for them. Everything absent from this list — farms, abandoned and
 * historical places, monasteries — is not a label anybody is looking for.
 */
const PLACE_KINDS: Record<string, number> = {
  PPLC: 3_000_000,
  PPLA: 500_000,
  PPLA2: 100_000,
  PPLA3: 30_000,
  PPLA4: 5_000,
  PPL: 1_000,
  PPLX: 800,
  PPLL: 300,
}

/**
 * The German name of each place, where GeoNames has one.
 *
 * The dump's `name` column is the internationally common name, which for the
 * larger cities is the English exonym — a map of this community must not label
 * its own country's cities "Munich" and "Cologne". The preferred German
 * alternate wins; failing that, any German one.
 */
async function loadGermanNames(file: string): Promise<Map<number, string>> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt vom Entwickler auf der Kommandozeile, nicht aus einer Anfrage
  const text = await readFile(file, 'utf8')
  const names = new Map<number, string>()
  const preferred = new Set<number>()
  for (const line of text.split('\n')) {
    const fields = line.split('\t')
    if (fields[2] !== 'de') continue
    const id = Number(fields[1])
    const name = (fields[3] ?? '').trim()
    if (!id || !name) continue
    const isPreferred = fields[4] === '1'
    // Historic and colloquial forms are not what a map should be labelled with.
    if (fields[7] === '1' || fields[6] === '1') continue
    if (isPreferred) {
      names.set(id, name)
      preferred.add(id)
    } else if (!preferred.has(id) && !names.has(id)) {
      names.set(id, name)
    }
  }
  return names
}

interface RawPlace {
  name: string
  lon: number
  lat: number
  /** Population where GeoNames knows it, a nominal figure for the kind if not. */
  rank: number
}

/**
 * Every populated place in GeoNames' German dump.
 *
 * Ranked by population, because that is what decides which name a reader wants
 * to see first when there is not room for all of them. Where the population is
 * missing — which is most villages and nearly every Stadtteil — the kind stands
 * in for it, so a municipality seat still outranks a hamlet.
 */
async function loadPlaces(file: string, german: Map<number, string>): Promise<RawPlace[]> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt vom Entwickler auf der Kommandozeile, nicht aus einer Anfrage
  const text = await readFile(file, 'utf8')
  const places: RawPlace[] = []
  for (const line of text.split('\n')) {
    const fields = line.split('\t')
    if (fields[6] !== 'P') continue
    const nominal = PLACE_KINDS[fields[7] ?? '']
    if (nominal === undefined) continue
    const name = (german.get(Number(fields[0])) ?? fields[1] ?? '').trim()
    const lat = Number(fields[4])
    const lon = Number(fields[5])
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    places.push({ name, lon, lat, rank: Number(fields[14]) || nominal })
  }
  // Most important first: the endpoint answers a bounding box by taking the
  // first however-many of these that fall inside it.
  places.sort((a, b) => b.rank - a.rank)
  return places
}

// --- projection ------------------------------------------------------------

/** Spherical Mercator. Conformal, so Germany keeps its shape at every latitude. */
function mercator(lon: number, lat: number): Point {
  const clamped = Math.max(-85, Math.min(85, lat))
  return [(lon * Math.PI) / 180, Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360))]
}

// --- geometry --------------------------------------------------------------

/** Every outer/inner ring of a Polygon or MultiPolygon, as raw lon/lat. */
function ringsOf(geometry: Feature['geometry']): { outer: Ring[]; holes: Ring[] } {
  if (!geometry) return { outer: [], holes: [] }
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as Ring[]]
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as Ring[][])
        : []
  const outer: Ring[] = []
  const holes: Ring[] = []
  for (const polygon of polygons) {
    polygon.forEach((ring, index) => (index === 0 ? outer : holes).push(ring))
  }
  return { outer, holes }
}

/** Twice the signed area — positive for counter-clockwise rings. */
function signedArea(ring: Ring): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  }
  return sum / 2
}

/** Area-weighted centroid of a set of rings. */
function centroidOf(rings: Ring[]): Point {
  let area = 0
  let cx = 0
  let cy = 0
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
      area += cross
      cx += (ring[j][0] + ring[i][0]) * cross
      cy += (ring[j][1] + ring[i][1]) * cross
    }
  }
  // A ring with no area left after quantisation has no meaningful centroid.
  if (area === 0) return rings[0]?.[0] ?? [0, 0]
  return [cx / (3 * area), cy / (3 * area)]
}

/** Perpendicular distance from `p` to the segment `a`–`b`. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
  )
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/**
 * A quantised point as one number, so it can key a Map. x < 12.000 and
 * y < 20.000 by construction, which fits comfortably either side of the shift.
 */
function pointKey(point: Point): number {
  return point[0] * 65536 + point[1]
}

/**
 * Douglas–Peucker on an open point sequence. Iterative with an explicit stack:
 * the recursive form degrades to one frame per vertex on a coastline-shaped
 * input, and some of these rings carry tens of thousands of them.
 *
 * **Symmetric under reversal**, and that is load-bearing, not a nicety: two
 * neighbouring postal codes walk the border they share in opposite directions,
 * and the whole topology stage below rests on both getting the same answer for
 * it. Douglas–Peucker is symmetric except where two vertices are exactly
 * equally far from the chord — on a 53 m integer grid that happens — so the tie
 * is broken by the coordinate rather than by which end we started from.
 */
function simplifyOpen(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [from, to] = stack.pop() as [number, number]
    let maxDistance = 0
    let index = -1
    for (let i = from + 1; i < to; i++) {
      const distance = segmentDistance(points[i], points[from], points[to])
      if (
        distance > maxDistance ||
        (index !== -1 && distance === maxDistance && pointKey(points[i]) < pointKey(points[index]))
      ) {
        maxDistance = distance
        index = i
      }
    }
    if (index === -1 || maxDistance <= tolerance) continue
    keep[index] = 1
    stack.push([from, index], [index, to])
  }
  return points.filter((_, i) => keep[i] === 1)
}

/** Drop repeated vertices — quantisation collapses many of them onto each other. */
function dedupe(ring: Ring): Ring {
  const out: Ring = []
  for (const point of ring) {
    const last = out[out.length - 1]
    if (last?.[0] === point[0] && last[1] === point[1]) continue
    out.push(point)
  }
  while (
    out.length > 1 &&
    out[0][0] === out[out.length - 1][0] &&
    out[0][1] === out[out.length - 1][1]
  ) {
    out.pop()
  }
  return out
}

/**
 * Simplify a closed ring. The ring is cut at its first vertex and treated as an
 * open line, which keeps that vertex fixed — good enough here, and it avoids the
 * degenerate case where a closed Douglas–Peucker collapses onto a single point.
 */
function simplifyRing(ring: Ring, tolerance: number): Ring {
  const closed = dedupe(ring)
  if (closed.length < 4) return closed
  return dedupe(simplifyOpen([...closed, closed[0]], tolerance))
}

// --- topology --------------------------------------------------------------

/**
 * Simplifying every polygon on its own tears the map apart.
 *
 * A border two postal codes share is then simplified *twice*, independently:
 * Douglas–Peucker picks a different subset of vertices for each, and each may
 * stray up to the tolerance from the true line — in opposite directions. What
 * the reader sees is a wedge of page colour between two areas that touch in
 * reality, up to twice the tolerance wide, widest where the kept vertices are
 * furthest apart. At 53 m that is a hundred metres of nothing, which at the
 * zoom this map opens at is plainly visible.
 *
 * The fix is the one TopoJSON is built around: stop treating a polygon as a
 * closed ring and treat the map as a planar graph. Cut every ring at the points
 * where the graph branches, simplify each *arc* between two such points, and
 * reassemble. A shared border is one arc, cut at the same two ends from both
 * sides and simplified to the same vertices — so the two areas agree on it by
 * construction, at any tolerance.
 *
 * The cost is that the rings have to be held in memory together instead of
 * being emitted as they stream past; see the note on `--max-old-space-size` in
 * docu/karte.md.
 */

/**
 * The points where the planar graph branches — where an arc has to end.
 *
 * The criterion is the degree of the point in the union of all rings: a vertex
 * in the middle of a border has exactly two distinct neighbours, whoever walks
 * through it and in whichever direction. A third one means something else joins
 * here — a second postal code, or the point where a shared border gives way to
 * a coast one of them has to itself — and both sides have to cut there, or they
 * will not be simplifying the same arc.
 */
function findJunctions(rings: Iterable<Ring>): Set<number> {
  // Up to two distinct neighbours are remembered per point; the third makes it
  // a junction, and the two entries are dropped again — for a country's worth
  // of borders the maps are the tall thing in this script.
  const firstNeighbour = new Map<number, number>()
  const secondNeighbour = new Map<number, number>()
  const junctions = new Set<number>()

  const note = (point: number, neighbour: number): void => {
    if (junctions.has(point)) return
    const first = firstNeighbour.get(point)
    if (first === undefined) {
      firstNeighbour.set(point, neighbour)
      return
    }
    if (first === neighbour) return
    const second = secondNeighbour.get(point)
    if (second === undefined) {
      secondNeighbour.set(point, neighbour)
      return
    }
    if (second === neighbour) return
    junctions.add(point)
    firstNeighbour.delete(point)
    secondNeighbour.delete(point)
  }

  for (const ring of rings) {
    const n = ring.length
    if (n < 3) continue
    for (let i = 0; i < n; i++) {
      const point = pointKey(ring[i])
      note(point, pointKey(ring[(i + 1) % n]))
      note(point, pointKey(ring[(i + n - 1) % n]))
    }
  }
  return junctions
}

/**
 * Simplify a ring arc by arc, so that whoever else walks the same arc gets the
 * same vertices back.
 *
 * A ring with no junction on it at all is an island — nobody shares anything
 * with it, and it is simplified as the closed ring it is.
 */
function simplifyRingByArcs(ring: Ring, junctions: Set<number>, tolerance: number): Ring {
  const cuts: number[] = []
  for (let i = 0; i < ring.length; i++) {
    if (junctions.has(pointKey(ring[i]))) cuts.push(i)
  }
  if (cuts.length === 0) return simplifyRing(ring, tolerance)

  const out: Ring = []
  for (let c = 0; c < cuts.length; c++) {
    const from = cuts[c] as number
    const to = cuts[(c + 1) % cuts.length] as number
    const arc: Ring = [ring[from]]
    for (let i = (from + 1) % ring.length; ; i = (i + 1) % ring.length) {
      arc.push(ring[i])
      if (i === to) break
    }
    // The closing point is the next arc's opening one; emitting it here would
    // duplicate every junction.
    const simplified = simplifyOpen(arc, tolerance)
    for (let i = 0; i < simplified.length - 1; i++) out.push(simplified[i])
  }
  return dedupe(out)
}

// --- path emission ---------------------------------------------------------

/** `-3` needs no separator after the previous number; `3` does. */
function appendNumber(out: string, value: number): string {
  return value < 0 ? out + String(value) : `${out} ${value}`
}

/** One ring as an `M`-relative-`l`-`z` subpath. */
function ringToPath(ring: Ring): string {
  if (ring.length < 3) return ''
  let d = `M${ring[0][0]} ${ring[0][1]}l`
  let [px, py] = ring[0]
  for (let i = 1; i < ring.length; i++) {
    const [x, y] = ring[i]
    d = appendNumber(d, x - px)
    d = appendNumber(d, y - py)
    px = x
    py = y
  }
  return `${d}z`
}

// --- silhouette ------------------------------------------------------------

/** One member way of the boundary relation, as Overpass returns it. */
interface BoundaryWay {
  type: string
  ref?: number
  role: string
  geometry?: { lat: number; lon: number }[]
}

const endpoint = (p: Point): string => `${p[0]},${p[1]}`

const toLine = (way: { geometry?: { lat: number; lon: number }[] }): Ring =>
  (way.geometry ?? []).map(({ lon, lat }): Point => [lon, lat])

/**
 * Assemble closed rings from a bag of open polylines that meet end to end.
 *
 * That is what an OSM boundary is: following the shared endpoints is the whole
 * algorithm. The lines come from the same database, so their coordinates match
 * exactly and no tolerance is needed.
 *
 * Deriving the outline from the postal-code areas instead was tried and
 * dropped: the union of 8.000 polygons is only obtainable by cancelling every
 * border two of them share, and doing that at a resolution coarse enough to fit
 * in memory makes a jagged coastline cancel *itself* wherever it leaves and
 * re-enters the same cell. The result is a border full of holes.
 */
function stitchRings(lines: Ring[]): Ring[] {
  const usable = lines.filter((line) => line.length >= 2)

  // Which lines start or end at a given point.
  const ends = new Map<string, number[]>()
  usable.forEach((line, index) => {
    for (const point of [line[0], line[line.length - 1]]) {
      const key = endpoint(point)
      const list = ends.get(key)
      if (list) list.push(index)
      else ends.set(key, [index])
    }
  })

  const used = new Set<number>()
  const rings: Ring[] = []
  for (let start = 0; start < usable.length; start++) {
    if (used.has(start)) continue
    used.add(start)
    const ring = [...usable[start]]
    for (;;) {
      const tail = ring[ring.length - 1]
      const candidate = (ends.get(endpoint(tail)) ?? []).find((index) => !used.has(index))
      if (candidate === undefined) break
      used.add(candidate)
      const line = usable[candidate]
      // The next line may be recorded in either direction.
      const next = endpoint(line[0]) === endpoint(tail) ? line : [...line].reverse()
      ring.push(...next.slice(1))
      if (endpoint(ring[0]) === endpoint(ring[ring.length - 1])) break
    }
    if (ring.length >= 4) rings.push(ring)
  }
  return rings
}

/** Ray casting against a set of rings, even-odd. */
function isInside(point: Point, rings: Ring[]): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi]: Point = ring[i]
      const [xj, yj]: Point = ring[j]
      if (yi > point[1] !== yj > point[1]) {
        if (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside
      }
    }
  }
  return inside
}

/**
 * The land outline of the country.
 *
 * Two sources, because neither alone is what a reader expects to see. The
 * boundary relation is `admin_level=2` — which in the north is the *territorial
 * sea*, twelve nautical miles out, drawn as arcs around the basepoints. Those
 * arcs are correct and look like a rendering fault: a coast that bulges into
 * the sea in smooth curves. So the maritime ways are dropped and the actual
 * coastline is stitched in where they were.
 *
 * The coastline comes as a rectangle of the map, which also catches the Danish,
 * Dutch and Polish coasts either side. Those are sorted out by asking whether a
 * way lies inside the full relation — territorial waters included, which is
 * exactly the test for "is this stretch of coast German".
 */
async function loadBoundary(
  file: string,
  tagsFile: string | undefined,
  coastFile: string | undefined,
): Promise<Ring[]> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt vom Entwickler auf der Kommandozeile, nicht aus einer Anfrage
  const data = JSON.parse(await readFile(file, 'utf8')) as {
    elements: { type: string; members?: BoundaryWay[] }[]
  }
  const members = (
    data.elements.find((element) => element.type === 'relation')?.members ?? []
  ).filter((member) => member.type === 'way' && member.geometry)
  if (members.length === 0) throw new Error(`No boundary relation with members in ${file}`)

  const maritime = new Set<number>()
  if (tagsFile) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt vom Entwickler auf der Kommandozeile, nicht aus einer Anfrage
    const tagged = JSON.parse(await readFile(tagsFile, 'utf8')) as {
      elements: { type: string; id: number; tags?: Record<string, string> }[]
    }
    for (const way of tagged.elements) {
      if (way.type === 'way' && way.tags?.maritime === 'yes') maritime.add(way.id)
    }
  }

  const landLines = members
    .filter((member) => member.ref === undefined || !maritime.has(member.ref))
    .map(toLine)
  if (!coastFile || maritime.size === 0) return stitchRings(landLines)

  // The full outline, territorial waters and all — only ever used to decide
  // which of the downloaded coast belongs to this country.
  const territorial = stitchRings(members.map(toLine))

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt vom Entwickler auf der Kommandozeile, nicht aus einer Anfrage
  const coastData = JSON.parse(await readFile(coastFile, 'utf8')) as {
    elements: { type: string; geometry?: { lat: number; lon: number }[] }[]
  }
  const coastLines = coastData.elements
    .filter((way) => way.type === 'way' && way.geometry)
    .map(toLine)
    .filter((line) => line.length >= 2 && isInside(line[Math.floor(line.length / 2)], territorial))
  console.warn(`  coast: ${coastLines.length} ways inside the country`)

  return stitchRings([...landLines, ...coastLines])
}

// --- main ------------------------------------------------------------------

const input = arg('in') ?? '/tmp/plz.geojson'
const namesFile = arg('names')
const boundaryFile = arg('boundary')
const placesFile = arg('places')
const tolerance = Number(arg('tolerance') ?? DEFAULT_TOLERANCE)
const outlineTolerance = Number(arg('outline-tolerance') ?? OUTLINE_TOLERANCE)
const root = path.resolve(import.meta.dirname, '..')

const names = namesFile ? await loadPlaceNames(namesFile) : new Map<string, string>()
console.warn(namesFile ? `Place names: ${names.size} postal codes` : 'No place names supplied')

const boundaryRings = boundaryFile
  ? await loadBoundary(boundaryFile, arg('boundary-tags'), arg('coast'))
  : []
if (boundaryFile) console.warn(`Boundary: ${boundaryRings.length} rings`)

const altNamesFile = arg('altnames')
const germanNames = altNamesFile ? await loadGermanNames(altNamesFile) : new Map<number, string>()
const rawPlaces = placesFile ? await loadPlaces(placesFile, germanNames) : []
if (placesFile) console.warn(`Places: ${rawPlaces.length} (${germanNames.size} German names)`)

const postcodeOf = (feature: Feature): string =>
  (
    feature.properties.postcode ??
    feature.properties.plz ??
    feature.properties.postal_code ??
    ''
  ).trim()

// Pass 1: the bounding box the projection is fitted to.
console.warn(`Reading ${input} (pass 1: extent) …`)
let minX = Infinity
let minY = Infinity
let maxX = -Infinity
let maxY = -Infinity
let featureCount = 0

const stretch = (rings: Ring[]): void => {
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      const [x, y] = mercator(lon, lat)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}

for await (const feature of streamFeatures(input)) {
  if (!postcodeOf(feature)) continue
  featureCount += 1
  const { outer, holes } = ringsOf(feature.geometry)
  stretch([...outer, ...holes])
}
// The silhouette has to fit in the same box, or the coast gets cut off at the
// edge of the viewBox wherever it reaches past the outermost postal code.
stretch(boundaryRings)

if (featureCount === 0) throw new Error(`No usable features in ${input}`)

const scale = VIEWBOX_WIDTH / (maxX - minX)
const height = Math.ceil((maxY - minY) * scale)
const viewBox = `0 0 ${VIEWBOX_WIDTH} ${height}`
// Mercator's x is the longitude in radians, so an arc length taken from it is
// the one at the equator. What matters is the ground resolution where the map
// actually is, which is that times the cosine of the middle latitude.
const middleLatitude = 2 * Math.atan(Math.exp((minY + maxY) / 2)) - Math.PI / 2
const metresPerUnit = Math.round(
  ((maxX - minX) * 6371000 * Math.cos(middleLatitude)) / VIEWBOX_WIDTH,
)
console.warn(`  ${featureCount} features · viewBox ${viewBox} · 1 unit ≈ ${metresPerUnit} m`)

/** Project → viewBox units → whole numbers. */
const quantise = (rings: Ring[]): Ring[] =>
  rings.map((ring) =>
    dedupe(
      ring.map(([lon, lat]): Point => {
        const [x, y] = mercator(lon, lat)
        return [Math.round((x - minX) * scale), Math.round((maxY - y) * scale)]
      }),
    ),
  )

// Pass 2: the geometry. Merging by postal code rather than by feature — a code
// can be several relations in OSM, and the map wants one shape per code.
//
// Held rather than emitted: the simplification below needs to know where the
// borders *between* these rings run, which is not knowable one feature at a
// time. See the topology section above.
console.warn(`Reading ${input} (pass 2: geometry) …`)

interface Collected {
  /** Place name, filled in at the end. */
  o: string
  /** Quantised, not yet simplified: outer rings first, then holes. */
  rings: Ring[]
  /** Centroid of the largest body seen so far, and the total area. */
  c: Point
  s: number
  /** The largest single body, to decide whose centroid to keep. */
  largest: number
}

const collected = new Map<string, Collected>()
let ringCount = 0
let vertexCount = 0

for await (const feature of streamFeatures(input)) {
  const plz = postcodeOf(feature)
  if (!plz) continue

  const { outer: rawOuter, holes: rawHoles } = ringsOf(feature.geometry)
  const outer = quantise(rawOuter).filter((ring) => ring.length >= 3)
  const holes = quantise(rawHoles).filter((ring) => ring.length >= 3)
  if (outer.length === 0 && holes.length === 0) continue

  const [cx, cy] = centroidOf(outer.length > 0 ? outer : holes)
  const size = outer.reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0)
  ringCount += outer.length + holes.length
  for (const ring of [...outer, ...holes]) vertexCount += ring.length

  const existing = collected.get(plz)
  if (existing) {
    existing.rings.push(...outer, ...holes)
    existing.s += size
    if (size > existing.largest) {
      existing.largest = size
      existing.c = [cx, cy]
    }
    continue
  }
  collected.set(plz, {
    o: names.get(plz) ?? '',
    rings: [...outer, ...holes],
    c: [cx, cy],
    s: size,
    largest: size,
  })
}

console.warn(`  ${collected.size} postal codes · ${ringCount} rings · ${vertexCount} vertices`)

// The planar graph, before anything is thrown away. Every ring of every postal
// code goes in: a hole in one area is the outer ring of another, and a border
// is only shared if both sides cut it in the same places.
console.warn('Finding junctions …')
const junctions = findJunctions(
  (function* () {
    for (const area of collected.values()) yield* area.rings
  })(),
)
console.warn(`  ${junctions.size} junctions`)

console.warn(`Simplifying arcs (tolerance ${tolerance}) …`)
const areas: PlzAreaFile['areas'] = {}
let keptVertices = 0

for (const [plz, area] of collected) {
  const simplified = area.rings
    .map((ring) => simplifyRingByArcs(ring, junctions, tolerance))
    .filter((ring) => ring.length >= 3)
  // Everything collapsed: keep the unsimplified shape, so even the smallest
  // city postal code still has a body to draw and to place a label on.
  const rings = simplified.length > 0 ? simplified : area.rings
  if (rings.length === 0) continue
  for (const ring of rings) keptVertices += ring.length

  areas[plz] = {
    o: area.o,
    d: rings.map(ringToPath).join(''),
    c: [Math.round(area.c[0]), Math.round(area.c[1])],
    s: Math.round(area.s),
  }
}

const named = Object.values(areas).filter((area) => area.o).length
console.warn(
  `  ${Object.keys(areas).length} postal codes, ${named} with a place name` +
    ` · ${keptVertices} of ${vertexCount} vertices kept`,
)

// Filled with the even-odd rule, so an enclave inside the country cuts itself
// out without anyone having to say which ring is a hole.
const outlinePath = quantise(boundaryRings)
  .map((ring) => simplifyRing(ring, outlineTolerance))
  // Slivers left by a coast that did not quite meet the land border.
  .filter((ring) => ring.length >= 3 && Math.abs(signedArea(ring)) >= MIN_OUTLINE_AREA)
  .map(ringToPath)
  .join('')
if (!boundaryFile) console.warn('No boundary supplied — the map will have no silhouette')

// Projected into the same coordinate system, still ranked. Places outside the
// box are impossible for German data, but a stray one must not be drawn onto
// the edge of the map.
const placeFile: PlaceFile = {
  viewBox,
  places: rawPlaces
    .map(({ name, lon, lat, rank }): PlaceFile['places'][number] => {
      const [x, y] = mercator(lon, lat)
      return [Math.round((x - minX) * scale), Math.round((maxY - y) * scale), rank, name]
    })
    .filter(([x, y]) => x >= 0 && x <= VIEWBOX_WIDTH && y >= 0 && y <= height),
}

const areasPath = path.join(root, 'server/assets/map/plz-areas.json')
const placesPath = path.join(root, 'server/assets/map/places.json')
await mkdir(path.dirname(areasPath), { recursive: true })

const areaFile: PlzAreaFile = { viewBox, outline: outlinePath, areas }
const areaJson = JSON.stringify(areaFile)
const placeJson = JSON.stringify(placeFile)
await writeFile(areasPath, areaJson)
await writeFile(placesPath, placeJson)

const kb = (value: string): string => `${Math.round(value.length / 1024)} kB`
console.warn(`Wrote ${areasPath} (${kb(areaJson)}, outline ${kb(outlinePath)})`)
console.warn(`Wrote ${placesPath} (${kb(placeJson)}, ${placeFile.places.length} places)`)
