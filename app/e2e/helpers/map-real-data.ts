import { readFileSync } from 'node:fs'
import path from 'node:path'

import { boundaryLayerIn, buildMapPayload, placesIn } from '../../server/helpers/memberMap'
import { resolutionFor } from '../../shared/map'

import type { LoadedAreas } from '../../server/helpers/memberMap'
import type { BoundaryFile, BoundaryResolution, PlaceFile, PlzAreaFile } from '../../shared/map'
import type { Page } from '@playwright/test'

/**
 * The map endpoints, answered from the committed geometry instead of from a
 * handful of invented triangles.
 *
 * The ordinary e2e mocks (`mockMapEndpoints`) draw two shapes and four border
 * segments, which is everything a *behaviour* test needs and nothing a
 * performance measurement can use: what costs the map at the zoom the reader
 * complains about is a hundred thousand vertices of Kreis border, and a mock
 * cannot produce those. So this one reads the real artefacts and runs the real
 * culling — the same `boundaryLayerIn` / `placesIn` / `buildMapPayload` the
 * server runs — while leaving the database and DAV out of it.
 *
 * Only the member counts are invented, and they may be: the aggregate is a few
 * dozen small shapes either way, and the geometry it carries is the real one.
 */

const ASSETS = path.resolve(import.meta.dirname, '../../server/assets/map')

/**
 * A different border artefact, for asking what a resolution the map does not
 * have would have cost.
 *
 * Pointing the benchmark at a file thinned to some other tolerance is how
 * "would a third stage between fine and coarse be worth building" gets an
 * answer from a browser rather than from an argument. Empty means the committed
 * artefact, which is what every run that is not that experiment wants.
 */
const BOUNDARY_FILE = process.env.MAP_PERF_BOUNDARIES

/** The artefacts, read once per test process — they are megabytes. */
let artefacts: {
  areas: LoadedAreas
  boundaries: BoundaryFile
  places: PlaceFile['places']
  viewBox: string
  outline: string
} | null = null

function load() {
  if (artefacts) return artefacts
  const raw = JSON.parse(readFileSync(path.join(ASSETS, 'plz-areas.json'), 'utf8')) as PlzAreaFile
  const boundaries = JSON.parse(
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad aus einer Env-Variable dieses Benchmarks
    readFileSync(BOUNDARY_FILE ?? path.join(ASSETS, 'boundaries.json'), 'utf8'),
  ) as BoundaryFile
  const places = (JSON.parse(readFileSync(path.join(ASSETS, 'places.json'), 'utf8')) as PlaceFile)
    .places
  artefacts = {
    areas: {
      viewBox: raw.viewBox,
      outline: raw.outline,
      areas: new Map(Object.entries(raw.areas)),
    },
    boundaries,
    places,
    viewBox: raw.viewBox,
    outline: raw.outline,
  }
  return artefacts
}

/** The same limits the endpoints apply — kept here so the mock cannot drift. */
const MAX_ARCS = 6000
const MAX_BOUNDARY_LABELS = 80
const MAX_PLACES = 400

/** The rectangle a request asks for, as the endpoints parse it. */
function boxOf(url: string) {
  const q = new URL(url).searchParams
  return {
    minX: Number(q.get('minX')),
    minY: Number(q.get('minY')),
    maxX: Number(q.get('maxX')),
    maxY: Number(q.get('maxY')),
    perPixel: Number(q.get('perPixel') ?? 0),
    levels: (q.get('levels') ?? 'state,district').split(','),
  }
}

/** What one boundary request cost, recorded so the benchmark can report it. */
export interface BoundaryRequestLog {
  levels: string[]
  perPixel: number
  resolution: BoundaryResolution
  /** Path bytes and vertices, per level. */
  perLevel: Record<string, { arcs: number; bytes: number; vertices: number }>
}

/** Vertices in a path of the artefact's `M x y l dx dy …` form. */
export function countVertices(d: string): number {
  return (d.match(/-?\d+/g) ?? []).length / 2
}

/**
 * Serve the map from the committed geometry.
 *
 * `plz` are the postal codes to put members in — a compact cluster, the way a
 * local association actually sits on the map, because the opening view is
 * fitted to it and every zoom step in the benchmark starts from there.
 *
 * Returns the log of boundary requests, which is what says whether a given zoom
 * was answered with the coarse or the fine copy.
 */
export async function mockRealMapEndpoints(
  page: Page,
  plz: string[],
  { forceResolution }: { forceResolution?: BoundaryResolution } = {},
): Promise<BoundaryRequestLog[]> {
  const data = load()
  const log: BoundaryRequestLog[] = []

  await page.route('**/api/map/status', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasPostalCode: true }),
    }),
  )

  await page.route('**/api/map/outline', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ viewBox: data.viewBox, d: data.outline }),
    }),
  )

  await page.route('**/api/map/members', async (route) => {
    // Counts spread over the five classes, so the ramp and the dot merging are
    // exercised rather than skipped.
    const rows = plz.map((code, index) => ({
      postalCode: code,
      count: [1, 2, 4, 8, 16][index % 5]!,
    }))
    const total = rows.reduce((sum, row) => sum + row.count, 0)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildMapPayload(rows, data.areas, total)),
    })
  })

  await page.route('**/api/map/places*', async (route) => {
    const box = boxOf(route.request().url())
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(placesIn(data.places, box, MAX_PLACES)),
    })
  })

  await page.route('**/api/map/boundaries*', async (route) => {
    const box = boxOf(route.request().url())
    // `forceResolution` answers a "what if" the endpoint cannot be asked —
    // would a coarser copy have done at the zoom the map lags at, and by how
    // much. The staging is what decides this in the app; here it is a probe.
    const resolution = forceResolution ?? resolutionFor(box.perPixel)
    const answer: Record<string, { d: string; labels: unknown[] }> = {}
    const perLevel: BoundaryRequestLog['perLevel'] = {}
    for (const level of box.levels) {
      if (level !== 'state' && level !== 'district') continue
      const layer = boundaryLayerIn(
        data.boundaries.levels[level],
        box,
        MAX_ARCS,
        MAX_BOUNDARY_LABELS,
        resolution,
      )
      answer[level] = layer
      perLevel[level] = {
        arcs: layer.d.split('M').length - 1,
        bytes: layer.d.length,
        vertices: countVertices(layer.d),
      }
    }
    log.push({ levels: box.levels, perPixel: box.perPixel, resolution, perLevel })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(answer),
    })
  })

  return log
}

/**
 * Postal codes around Darmstadt and the Bergstraße — the region the map was
 * reported slow in, and a realistic spread for an association of this size.
 */
export const RHEIN_MAIN_PLZ = [
  '64285', // Darmstadt
  '64625', // Bensheim
  '64673', // Zwingenberg
  '64646', // Heppenheim
  '64521', // Groß-Gerau
  '63225', // Langen
  '64380', // Roßdorf
  '64839', // Münster
  '68519', // Viernheim
  '64560', // Riedstadt
]
