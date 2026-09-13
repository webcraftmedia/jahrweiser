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
 *   --states / --districts  The `admin_level=4` and `admin_level=6` relations
 *            with `out geom` (ODbL). Optional; without them the map has no
 *            Bundesland and Kreis borders to orient by.
 *
 * Output:
 *   server/assets/map/plz-areas.json  — the coordinate system, the country
 *       silhouette and every postal code. The endpoint sends the client the
 *       silhouette plus the handful of areas that actually have members in
 *       them, which is why the full set never has to be small.
 *   server/assets/map/places.json     — towns and villages, for the labels.
 *   server/assets/map/boundaries.json — Bundesland and Kreis borders as arcs,
 *       each with its bounding box, so the endpoint can answer a view.
 *
 * `--only-borders` rebuilds the last of those alone, reusing the coordinate
 * system recorded in `plz-areas.json` — the two data sets age independently and
 * a full run is half a gigabyte of input.
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

import type {
  BoundaryArc,
  BoundaryFile,
  BoundaryLevel,
  MapProjection,
  PlaceFile,
  PlzAreaFile,
} from '../shared/map'

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

/**
 * Simplification tolerance for the administrative borders: **none**.
 *
 * Zero is not "off" — Douglas–Peucker with a tolerance of 0 still drops every
 * vertex that lies *exactly* on the line between the two it would be judged
 * against, which after quantisation is a great many of them. What it cannot do
 * is move a line: the result passes through precisely the points the input did.
 * That is the whole point of the number, and it took two wrong answers to get
 * to it.
 *
 * **3 ≈ 160 m** was argued from the silhouette — a reference line, not a shape
 * anyone measures. But Douglas–Peucker knows nothing about the feature it is
 * cutting, and where a whole shape is only a few tolerances across, that *is*
 * the shape: the interlocking Hessen / Baden-Württemberg enclaves around
 * Ober-Laudenbach are about a kilometre wide and came out a knot of spikes.
 *
 * **1 ≈ 53 m**, the grid itself, was the obvious retreat and still wrong,
 * because the objection is not the size of the tolerance but the algorithm:
 * **Douglas–Peucker does not preserve topology.** Measured on those same
 * enclaves, the input has *no* self-intersections at any stage — lon/lat,
 * projected, quantised — and the simplified arcs have eight, five of them
 * inside a single arc. A border that crosses itself is wrong at every zoom, and
 * no tolerance above zero rules it out.
 *
 * What is left at zero is the grid: 10 crossings in the state layer and 58 in
 * the district layer, country-wide, where two borders pass within 53 m of each
 * other and swap sides when rounded. Those need a finer coordinate system, not
 * a different tolerance.
 *
 * The cost is real — 30 → 67 kB brotli for the largest request either layer
 * ever answers — and it is spent where it can be seen: unlike the silhouette,
 * these borders are still drawn at the deepest zoom the map allows, three
 * kilometres across, where one grid unit is some twenty pixels.
 */
const BORDER_TOLERANCE = 0

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
 * Yield the members of the input's `features` array one at a time — or of
 * whatever other top-level array is named, which is how the district boundaries
 * are read: Overpass calls its array `elements` and answers a query for all of
 * Germany's Kreise with a few hundred megabytes of it.
 *
 * A hand-rolled scanner rather than a streaming-JSON dependency: all it has to
 * do is find the array and then count braces, minding that a brace inside a
 * string is not a brace. The consumed prefix is dropped after every feature, so
 * the buffer never holds more than one feature plus one chunk.
 */
async function* streamElements<T>(file: string, arrayKey = 'features'): AsyncGenerator<T> {
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
      const key = buffer.indexOf(`"${arrayKey}"`)
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

/**
 * Drop repeated vertices — quantisation collapses many of them onto each other.
 * Keeps an open line open, which is what the administrative borders need: an
 * arc that happens to start and end at the same point is a way around an
 * enclave, and closing it away would leave a gap in the line.
 */
function collapse(line: Ring): Ring {
  const out: Ring = []
  for (const point of line) {
    const last = out[out.length - 1]
    if (last?.[0] === point[0] && last[1] === point[1]) continue
    out.push(point)
  }
  return out
}

/** As `collapse`, and the closing vertex goes too — rings carry it implicitly. */
function dedupe(ring: Ring): Ring {
  const out = collapse(ring)
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

/** One open polyline as an `M`-relative-`l` subpath — a border, not a body. */
function lineToPath(line: Ring): string {
  if (line.length < 2) return ''
  let d = `M${line[0][0]} ${line[0][1]}l`
  let [px, py] = line[0]
  for (let i = 1; i < line.length; i++) {
    const [x, y] = line[i]
    d = appendNumber(d, x - px)
    d = appendNumber(d, y - py)
    px = x
    py = y
  }
  return d
}

/** One ring as an `M`-relative-`l`-`z` subpath. */
function ringToPath(ring: Ring): string {
  if (ring.length < 3) return ''
  return `${lineToPath(ring)}z`
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
/**
 * The ways an Overpass answer marks `maritime=yes` — the territorial-sea arcs,
 * twelve nautical miles out, which every coastal administrative boundary
 * carries and none of them should be drawn with.
 *
 * Several files may be named, comma-separated: the national relation and the
 * administrative levels are separate queries, and a way is maritime for all of
 * them or for none. Empty when nothing was supplied.
 */
async function loadMaritimeWays(files: string | undefined): Promise<Set<number>> {
  const maritime = new Set<number>()
  for (const file of (files ?? '').split(',').filter(Boolean)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt vom Entwickler auf der Kommandozeile, nicht aus einer Anfrage
    const tagged = JSON.parse(await readFile(file, 'utf8')) as {
      elements: { type: string; id: number; tags?: Record<string, string> }[]
    }
    for (const way of tagged.elements) {
      if (way.type === 'way' && way.tags?.maritime === 'yes') maritime.add(way.id)
    }
  }
  return maritime
}

async function loadBoundary(
  file: string,
  maritime: Set<number>,
  coastFile: string | undefined,
): Promise<{ rings: Ring[]; ways: Set<number> }> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad kommt vom Entwickler auf der Kommandozeile, nicht aus einer Anfrage
  const data = JSON.parse(await readFile(file, 'utf8')) as {
    elements: { type: string; members?: BoundaryWay[] }[]
  }
  const members = (
    data.elements.find((element) => element.type === 'relation')?.members ?? []
  ).filter((member) => member.type === 'way' && member.geometry)
  if (members.length === 0) throw new Error(`No boundary relation with members in ${file}`)

  // Which ways the silhouette already draws. The state layer subtracts them, so
  // no stretch of border is drawn by two layers at once.
  const ways = new Set<number>()
  for (const member of members) {
    if (member.ref !== undefined) ways.add(member.ref)
  }

  const landLines = members
    .filter((member) => member.ref === undefined || !maritime.has(member.ref))
    .map(toLine)
  if (!coastFile || maritime.size === 0) return { rings: stitchRings(landLines), ways }

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

  return { rings: stitchRings([...landLines, ...coastLines]), ways }
}

// --- administrative borders ------------------------------------------------

/**
 * Bundesland and Kreis borders, so that a reader who has zoomed past the point
 * where the country silhouette is on screen can still tell where they are.
 *
 * Stored as **arcs, deduplicated by OSM way id** rather than as one shape per
 * area, which is what makes this cheap. A border two Kreise share is a single
 * way carried by both relations: one copy in the artefact, one line on screen,
 * and — unlike the postal-code areas, which needed a whole topology stage for
 * this (see docu/karte.md) — no way for two neighbours to end up disagreeing
 * about where their common border runs, because there is only ever one of it.
 *
 * The levels are stored as a *partition*, not as three complete networks: the
 * state layer leaves out the ways the silhouette already draws, the district
 * layer leaves out the ways the state layer draws. Nothing is ever painted
 * twice, and because the coarser layers are always on screen when a finer one
 * is, no network looks torn. See the visibility staging in MemberMap.vue.
 */
interface AdminMember {
  type: string
  ref?: number
  role: string
  lat?: number
  lon?: number
  geometry?: { lat: number; lon: number }[]
}

interface AdminRelation {
  type: string
  tags?: Record<string, string>
  members?: AdminMember[]
}

/**
 * A German administrative relation, as opposed to a neighbouring country's.
 *
 * Overpass answers `rel(area.de)` with everything that has a member inside
 * Germany, and a Dutch or Polish district that shares a way with the border has
 * one. German relations carry the official keys — `de:regionalschluessel`,
 * `de:amtlicher_gemeindeschluessel` — or an ISO code naming the country, and
 * nobody else's do. A tag test rather than a point-in-country test: the latter
 * would be thousands of ray casts against the whole national outline, for a
 * question the data already answers.
 */
function isGerman(tags: Record<string, string> | undefined): boolean {
  if (!tags) return false
  if ((tags['ISO3166-2'] ?? '').startsWith('DE-')) return true
  return Object.keys(tags).some((key) => key.startsWith('de:'))
}

/** One administrative level, still in lon/lat. */
interface AdminLevel {
  /** The border ways this level is the first to draw, by way id. */
  arcs: Map<number, Ring>
  /** Every way of the level, so a finer one can subtract them. */
  ways: Set<number>
  /** One per area: what to write on the map, and where. */
  labels: { name: string; rings: Ring[]; anchor: Point | null }[]
  /** Relations dropped as belonging to another country. */
  foreign: number
}

/**
 * Read one `admin_level` as Overpass returns it with `out geom`.
 *
 * Streamed for the same reason the postal codes are: all of Germany's Kreise
 * with their geometry is a hundred megabytes and more, and this way the peak is
 * one relation rather than the whole answer plus its parsed form.
 */
async function loadAdminLevel(
  file: string,
  maritime: Set<number>,
  covered: Set<number>,
): Promise<AdminLevel> {
  const level: AdminLevel = { arcs: new Map(), ways: new Set(), labels: [], foreign: 0 }
  // Ways Overpass gave no id for cannot be deduplicated against anything; they
  // still need a key of their own.
  let anonymous = 0

  for await (const relation of streamElements<AdminRelation>(file, 'elements')) {
    if (relation.type !== 'relation') continue
    const name = (relation.tags?.name ?? '').trim()
    if (!name) continue
    if (!isGerman(relation.tags)) {
      level.foreign += 1
      continue
    }

    const land = (relation.members ?? []).filter(
      (member) =>
        member.type === 'way' &&
        member.geometry &&
        (member.ref === undefined || !maritime.has(member.ref)),
    )
    for (const member of land) {
      const id = member.ref ?? (anonymous -= 1)
      level.ways.add(id)
      if (covered.has(id) || level.arcs.has(id)) continue
      level.arcs.set(id, toLine(member))
    }

    // Where the name goes. The `label` member is the role OSM has for exactly
    // this question and beats any centroid; `admin_centre` deliberately does
    // not stand in for it, since that is the seat *town* and already carries
    // its own name on the map.
    const anchor = (relation.members ?? []).find(
      (member) => member.type === 'node' && member.role === 'label',
    )
    level.labels.push({
      name,
      // The body the label is sized and, failing an anchor, placed by — from
      // *every* way, the maritime ones included. They are dropped from the ink
      // because a territorial-sea arc looks like a rendering fault, but without
      // them a coastal outline no longer closes and the shoelace formula reads
      // the chord across the gap as the coast: Schleswig-Holstein came out at
      // a seventh of its area and lost its name to the fit rule.
      rings: stitchRings(
        (relation.members ?? [])
          .filter((member) => member.type === 'way' && member.geometry)
          .map(toLine),
      ),
      anchor:
        anchor?.lon !== undefined && anchor.lat !== undefined ? [anchor.lon, anchor.lat] : null,
    })
  }
  return level
}

// --- main ------------------------------------------------------------------

const input = arg('in') ?? '/tmp/plz.geojson'
const namesFile = arg('names')
const boundaryFile = arg('boundary')
const placesFile = arg('places')
const statesFile = arg('states')
const districtsFile = arg('districts')
const tolerance = Number(arg('tolerance') ?? DEFAULT_TOLERANCE)
const outlineTolerance = Number(arg('outline-tolerance') ?? OUTLINE_TOLERANCE)
const borderTolerance = Number(arg('border-tolerance') ?? BORDER_TOLERANCE)
const root = path.resolve(import.meta.dirname, '..')

const areasPath = path.join(root, 'server/assets/map/plz-areas.json')
const placesPath = path.join(root, 'server/assets/map/places.json')
const bordersPath = path.join(root, 'server/assets/map/boundaries.json')

/**
 * Rebuild only the administrative borders, reusing the coordinate system the
 * committed artefact already records.
 *
 * The two data sets age independently — a Kreisreform has nothing to do with
 * the postal codes — and a full run costs half a gigabyte of download and eight
 * gigabytes of heap. Anything that would change the projection is exactly what
 * this mode refuses to do, so the borders cannot come out in a coordinate
 * system the rest of the map does not share.
 */
const bordersOnly = process.argv.includes('--only-borders')

const names =
  namesFile && !bordersOnly ? await loadPlaceNames(namesFile) : new Map<string, string>()
if (!bordersOnly) {
  console.warn(namesFile ? `Place names: ${names.size} postal codes` : 'No place names supplied')
}

// Shared by the silhouette and by every administrative level: the
// territorial-sea arcs belong to none of them.
const maritime = await loadMaritimeWays(arg('boundary-tags'))

const boundary = boundaryFile
  ? await loadBoundary(boundaryFile, maritime, arg('coast'))
  : { rings: [] as Ring[], ways: new Set<number>() }
if (boundaryFile) console.warn(`Boundary: ${boundary.rings.length} rings`)

const altNamesFile = arg('altnames')
const germanNames =
  altNamesFile && !bordersOnly ? await loadGermanNames(altNamesFile) : new Map<number, string>()
const rawPlaces = placesFile && !bordersOnly ? await loadPlaces(placesFile, germanNames) : []
if (placesFile && !bordersOnly) {
  console.warn(`Places: ${rawPlaces.length} (${germanNames.size} German names)`)
}

const postcodeOf = (feature: Feature): string =>
  (
    feature.properties.postcode ??
    feature.properties.plz ??
    feature.properties.postal_code ??
    ''
  ).trim()

/**
 * The coordinate system. Either measured from the input (pass 1), or taken from
 * the artefact that already holds it, and then it must not be recomputed:
 * a viewBox that disagrees with the committed one by a single unit would draw
 * today's borders a few hundred metres off yesterday's areas.
 */
let proj: MapProjection
let viewBox: string
let height: number

if (bordersOnly) {
  const existing = JSON.parse(await readFile(areasPath, 'utf8')) as PlzAreaFile
  if (!existing.proj) {
    throw new Error(
      `${areasPath} carries no projection — run the full build once before --only-borders`,
    )
  }
  proj = existing.proj
  viewBox = existing.viewBox
  height = Number(viewBox.split(/\s+/)[3])
  console.warn(`Reusing the committed coordinate system · viewBox ${viewBox}`)
} else {
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

  for await (const feature of streamElements<Feature>(input)) {
    if (!postcodeOf(feature)) continue
    featureCount += 1
    const { outer, holes } = ringsOf(feature.geometry)
    stretch([...outer, ...holes])
  }
  // The silhouette has to fit in the same box, or the coast gets cut off at the
  // edge of the viewBox wherever it reaches past the outermost postal code.
  stretch(boundary.rings)

  if (featureCount === 0) throw new Error(`No usable features in ${input}`)

  // The administrative levels are deliberately *not* stretched to: they lie
  // inside the country by construction, and letting them widen the box would
  // move every coordinate in the other two artefacts.
  const scale = VIEWBOX_WIDTH / (maxX - minX)
  height = Math.ceil((maxY - minY) * scale)
  viewBox = `0 0 ${VIEWBOX_WIDTH} ${height}`
  proj = { x0: minX, y0: maxY, k: scale }
  // Mercator's x is the longitude in radians, so an arc length taken from it is
  // the one at the equator. What matters is the ground resolution where the map
  // actually is, which is that times the cosine of the middle latitude.
  const middleLatitude = 2 * Math.atan(Math.exp((minY + maxY) / 2)) - Math.PI / 2
  const metresPerUnit = Math.round(
    ((maxX - minX) * 6371000 * Math.cos(middleLatitude)) / VIEWBOX_WIDTH,
  )
  console.warn(`  ${featureCount} features · viewBox ${viewBox} · 1 unit ≈ ${metresPerUnit} m`)
}

/** Project one lon/lat pair → viewBox units → whole numbers. */
const project = ([lon, lat]: Point): Point => {
  const [x, y] = mercator(lon, lat)
  return [Math.round((x - proj.x0) * proj.k), Math.round((proj.y0 - y) * proj.k)]
}

/** The same for whole rings, closing vertex dropped. */
const quantise = (rings: Ring[]): Ring[] => rings.map((ring) => dedupe(ring.map(project)))

// Pass 2: the geometry. Merging by postal code rather than by feature — a code
// can be several relations in OSM, and the map wants one shape per code.
//
// Held rather than emitted: the simplification below needs to know where the
// borders *between* these rings run, which is not knowable one feature at a
// time. See the topology section above.

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

const kb = (value: string): string => `${Math.round(value.length / 1024)} kB`
await mkdir(path.dirname(areasPath), { recursive: true })

if (!bordersOnly) {
  console.warn(`Reading ${input} (pass 2: geometry) …`)
  const collected = new Map<string, Collected>()
  let ringCount = 0
  let vertexCount = 0

  for await (const feature of streamElements<Feature>(input)) {
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
  const outlinePath = quantise(boundary.rings)
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
        const [x, y] = project([lon, lat])
        return [x, y, rank, name]
      })
      .filter(([x, y]) => x >= 0 && x <= VIEWBOX_WIDTH && y >= 0 && y <= height),
  }

  const areaFile: PlzAreaFile = { viewBox, outline: outlinePath, areas, proj }
  const areaJson = JSON.stringify(areaFile)
  const placeJson = JSON.stringify(placeFile)
  await writeFile(areasPath, areaJson)
  await writeFile(placesPath, placeJson)

  console.warn(`Wrote ${areasPath} (${kb(areaJson)}, outline ${kb(outlinePath)})`)
  console.warn(`Wrote ${placesPath} (${kb(placeJson)}, ${placeFile.places.length} places)`)
}

// --- the administrative borders --------------------------------------------

if (statesFile || districtsFile) {
  /**
   * The ways a coarser layer already draws. Seeded with the silhouette's, so the
   * state layer does not put a second line on the national border, and grown by
   * each level in turn.
   */
  const covered = new Set(boundary.ways)
  const levels = {} as BoundaryFile['levels']

  /** One arc: its box, so the endpoint can cull it, and its path. */
  const toArc = (line: Ring): BoundaryArc | null => {
    const simplified = simplifyOpen(collapse(line.map(project)), borderTolerance)
    if (simplified.length < 2) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of simplified) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    return [minX, minY, maxX, maxY, lineToPath(simplified)]
  }

  for (const [key, file] of [
    ['state', statesFile],
    ['district', districtsFile],
  ] as const) {
    if (!file) {
      levels[key] = { arcs: [], labels: [] }
      console.warn(`No ${key} boundaries supplied`)
      continue
    }

    console.warn(`Reading ${file} (${key} borders) …`)
    const level = await loadAdminLevel(file, maritime, covered)
    for (const id of level.ways) covered.add(id)

    const arcs = [...level.arcs.values()]
      .map(toArc)
      .filter((arc): arc is BoundaryArc => arc !== null)
      // Longest first, by the extent of the box: an answer that hits its limit
      // then drops the specks rather than the line across the whole view.
      .sort((a, b) => b[2] - b[0] + (b[3] - b[1]) - (a[2] - a[0]) - (a[3] - a[1]))

    const labels = level.labels
      .map(({ name, rings, anchor }): BoundaryFile['levels'][BoundaryLevel]['labels'][number] => {
        const quantised = quantise(rings).filter((ring) => ring.length >= 3)
        const size = quantised.reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0)
        const biggest = quantised.reduce(
          (best, ring) => (Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best),
          quantised[0] ?? [],
        )
        const [x, y] = anchor ? project(anchor) : centroidOf([biggest])
        return [Math.round(x), Math.round(y), Math.round(size), name]
      })
      // Biggest first, for the same reason as the arcs — and it is also the
      // order the client hands out the space it has for names in.
      .sort((a, b) => b[2] - a[2])

    levels[key] = { arcs, labels }
    console.warn(
      `  ${level.arcs.size} new arcs of ${level.ways.size} ways · ${labels.length} names` +
        (level.foreign > 0 ? ` · ${level.foreign} foreign relations dropped` : ''),
    )
  }

  const borderFile: BoundaryFile = { viewBox, proj, levels }
  const borderJson = JSON.stringify(borderFile)
  await writeFile(bordersPath, borderJson)
  console.warn(
    `Wrote ${bordersPath} (${kb(borderJson)}` +
      `, ${levels.state.arcs.length} state + ${levels.district.arcs.length} district arcs)`,
  )
}
