/**
 * The geometry the map artefacts are built out of: Douglas–Peucker, the
 * self-intersection check that keeps it from tying a border in a knot, and the
 * path serialisation the artefact stores its lines as.
 *
 * Its own module because two scripts need exactly this and nothing else of
 * `build-map-data.ts`: the full build, and `thin-boundaries.ts`, which fits an
 * existing artefact with a resolution it was built without. Two copies of
 * Douglas–Peucker would drift, and the one thing this code may not do is give
 * two callers different answers for the same line — the whole topology stage of
 * the build rests on that (see docu/karte.md, "Why the borders meet").
 */

export type Point = [number, number]
export type Ring = Point[]

/** Vertices per window — see `simplifyRing`. */
export const REPAIR_WINDOW = 256

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
export function pointKey(point: Point): number {
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
export function collapse(line: Ring): Ring {
  const out: Ring = []
  for (const point of line) {
    const last = out[out.length - 1]
    if (last?.[0] === point[0] && last[1] === point[1]) continue
    out.push(point)
  }
  return out
}

/** As `collapse`, and the closing vertex goes too — rings carry it implicitly. */
export function dedupe(ring: Ring): Ring {
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

/** Do these two segments properly cross? Touching and collinear do not count. */
function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const side = (o: Point, a: Point, b: Point): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const d1 = side(p3, p4, p1)
  const d2 = side(p3, p4, p2)
  const d3 = side(p1, p2, p3)
  const d4 = side(p1, p2, p4)
  // A zero means an endpoint lies on the other segment: two arcs meeting at a
  // junction, or three collinear points. Neither is a crossing.
  if (d1 === 0 || d2 === 0 || d3 === 0 || d4 === 0) return false
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0
}

/**
 * Does this line cross *itself*? The one thing simplification must never
 * produce, and the one thing Douglas–Peucker does not rule out.
 *
 * DP guarantees that no vertex strays further than the tolerance from the line
 * it replaces — it says nothing about the result staying simple. Where a
 * boundary doubles back on itself within the tolerance (a meander, a corridor,
 * the interlocking enclaves at Ober-Laudenbach) the shortcut can jump the line
 * to the wrong side of itself, and what the reader sees is a spike or a bow tie.
 * Measured on the administrative borders, the input had no self-intersections at
 * any stage and the simplified arcs had eight; on the postal-code areas the
 * committed artefact carried 192, in 138 of 8.175 areas, the median one
 * enclosing some 370 m.
 *
 * So the tolerance is not asked to be small enough to be safe — the result is
 * checked, and whatever fails keeps the geometry it came in with. Quadratic in
 * the vertex count, which is why it is applied per *arc* (a few dozen vertices)
 * rather than per ring.
 */
function selfIntersects(points: Point[], closed: boolean): boolean {
  // A closed ring carries the segment back to its first point; an open one does
  // not. `dedupe` has already dropped the repeated closing vertex.
  const count = closed ? points.length : points.length - 1
  if (count < 4) return false
  for (let i = 0; i < count; i++) {
    const a1 = points[i]
    const a2 = points[(i + 1) % points.length]
    // From i + 2: neighbouring segments share an endpoint by construction.
    for (let j = i + 2; j < count; j++) {
      // The first and the final segment of a ring are neighbours as well.
      if (closed && i === 0 && j === count - 1) continue
      if (segmentsCross(a1, a2, points[j], points[(j + 1) % points.length])) return true
    }
  }
  return false
}

/**
 * Simplify an open line as far as the tolerance allows *without tying it in a
 * knot*, halving the tolerance until the result comes out simple.
 *
 * Refusing to simplify at all would be the obvious answer and is a bad one: the
 * geometry it falls back to is some ten times denser than what the tolerance
 * would have kept, so a handful of knots along the coast cost more than every
 * other vertex on it put together — measured, 51 kB against 34. A knot is a
 * local accident of one shortcut, and it almost always survives only the
 * coarsest step.
 *
 * Zero is the floor and needs no check: it drops none but the exactly collinear
 * vertices, so it cannot move a line and cannot create a crossing the input did
 * not already have.
 */
export function simplifySafely(points: Point[], tolerance: number): Point[] {
  for (let t = tolerance; t > 0; t = Math.floor(t / 2)) {
    const simplified = simplifyOpen(points, t)
    if (!selfIntersects(simplified, false)) return simplified
  }
  return simplifyOpen(points, 0)
}

/** `-3` needs no separator after the previous number; `3` does. */
function appendNumber(out: string, value: number): string {
  return value < 0 ? out + String(value) : `${out} ${value}`
}

/** One open polyline as an `M`-relative-`l` subpath — a border, not a body. */
export function lineToPath(line: Ring): string {
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
