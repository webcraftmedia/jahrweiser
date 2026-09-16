import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { MEDIUM_TOLERANCE } from '../shared/map'

import { lineToPath, simplifySafely } from './map/geometry'

import type { BoundaryArc, BoundaryFile, BoundaryLevel } from '../shared/map'
import type { Point } from './map/geometry'

/**
 * Fit an existing border artefact with a resolution it was built without.
 *
 * `build-map-data.ts` produces all three copies, but only from the raw OSM
 * answers — a few hundred megabytes of Overpass output that is deliberately not
 * in the repository. Adding a stage would therefore mean re-downloading the
 * world to re-derive geometry that is already committed, which is why this
 * exists: it reads the artefact's own fine arcs and thins them.
 *
 * That this is legitimate rests on one fact, and it would not be legitimate
 * without it: `BORDER_TOLERANCE` is **0**. The stored arcs have had nothing
 * removed but vertices lying exactly on the line between their neighbours, and
 * a vertex like that changes no Douglas–Peucker decision at any tolerance above
 * zero — it can never be the farthest point from a chord it already lies on. So
 * simplifying the artefact gives what simplifying the source would have given.
 *
 * Both routes therefore agree, and the point of keeping both is that neither
 * becomes the only one: run this to get the stage today, and the next full
 * build produces the same stage from the source without anybody remembering to.
 *
 *   npx tsx scripts/thin-boundaries.ts [--tolerance <units>] [--dry-run]
 *
 * Idempotent: it always thins `arcs`, never a copy of a copy.
 */

const args = process.argv.slice(2)

function option(name: string): string | undefined {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? undefined : args[at + 1]
}

const tolerance = Number(option('tolerance') ?? MEDIUM_TOLERANCE)
const dryRun = args.includes('--dry-run')
const file =
  option('in') ?? path.resolve(import.meta.dirname, '../server/assets/map/boundaries.json')

/** The points of an `M x y l dx dy …` arc, as the artefact stores them. */
function parsePath(d: string): Point[] {
  const numbers = (d.match(/-?\d+/g) ?? []).map(Number)
  if (numbers.length < 2) return []
  const points: Point[] = [[numbers[0]!, numbers[1]!]]
  let x = numbers[0]!
  let y = numbers[1]!
  for (let i = 2; i + 1 < numbers.length; i += 2) {
    x += numbers[i]!
    y += numbers[i + 1]!
    points.push([x, y])
  }
  return points
}

/** One arc thinned, with the bounding box the endpoint culls against. */
function thin(arc: BoundaryArc, cut: number): BoundaryArc | null {
  const simplified = simplifySafely(parsePath(arc[4]), cut)
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

const vertices = (arcs: BoundaryArc[]): number =>
  arcs.reduce((sum, arc) => sum + (arc[4].match(/-?\d+/g) ?? []).length / 2, 0)

// Parsed as a partial: what comes off disk is data, not a value the type system
// watched being built, and this script exists to be pointed at older artefacts.
const artefact = JSON.parse(
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad aus der Kommandozeile dieses Werkzeugs
  readFileSync(file, 'utf8'),
) as Partial<BoundaryFile>
if (!artefact.levels) {
  console.error(`${file} carries no border levels — run the full build first`)
  process.exit(1)
}

console.warn(`Thinning ${file} to tolerance ${tolerance} …`)
for (const key of ['state', 'district'] as BoundaryLevel[]) {
  const level = artefact.levels[key] as BoundaryFile['levels'][BoundaryLevel] | undefined
  if (!level || level.arcs.length === 0) {
    console.warn(`  ${key}: nothing to thin`)
    continue
  }
  // Order is not restored: the artefact's `arcs` are already sorted longest
  // first by the box, thinning moves no endpoint far enough to change that, and
  // the sort is what makes the endpoint's arc limit drop the specks.
  const medium = level.arcs
    .map((arc) => thin(arc, tolerance))
    .filter((arc): arc is BoundaryArc => arc !== null)
  level.medium = medium
  const before = vertices(level.arcs)
  const after = vertices(medium)
  console.warn(
    `  ${key}: ${before} → ${after} vertices (${Math.round((after / before) * 100)} %),` +
      ` coarse is ${vertices(level.coarse)}`,
  )
}

if (dryRun) {
  console.warn('--dry-run: nothing written')
} else {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dito
  writeFileSync(file, JSON.stringify(artefact))
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dito
  const size = readFileSync(file).length
  console.warn(`Wrote ${file} (${(size / 1024 / 1024).toFixed(2)} MB)`)
}
