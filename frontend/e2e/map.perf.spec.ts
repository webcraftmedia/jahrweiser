import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { DEFAULT_USER, loginAs, navigateClientSide } from './helpers/api-mocks'
import { RHEIN_MAIN_PLZ, mockRealMapEndpoints } from './helpers/map-real-data'

import type { BoundaryRequestLog } from './helpers/map-real-data'
import type { BoundaryResolution } from '../shared/map'
import type { CDPSession, Page } from '@playwright/test'

/**
 * What the map costs to pan, at every zoom step from the country down.
 *
 * A benchmark, not a test: it asserts almost nothing and prints a table. The
 * reason it exists is that the map's slowness was argued about from the
 * artefact — "the district layer switches to the fine copy at span 0.24, which
 * is 178.000 vertices" — and an argument from the artefact cannot say whether
 * the browser minds. This puts a number on it, before and after a change.
 *
 * It is kept out of the ordinary suite (`MAP_PERF=1` to run) for the usual
 * reason: timings on a shared CI runner are noise, and a benchmark that fails
 * the build teaches everyone to ignore it. What *can* go in the suite once the
 * numbers are understood is the structural half — how many vertices a given
 * zoom draws — which is deterministic. See `drawn` below.
 *
 *   MAP_PERF=1 npx playwright test e2e/map.perf.spec.ts --reporter=list
 *
 * Knobs, all env vars because a benchmark that has to be edited to be re-run
 * gets run once:
 *   MAP_PERF_CPU=4      CPU throttling factor (1 = none). 4 approximates a
 *                       mid-range phone and pulls the differences out of the
 *                       noise on a fast desktop.
 *   MAP_PERF_WIDTH/HEIGHT   the window to measure in; the default is the
 *                       1080p desktop the report came from, where the map is
 *                       far wider than it is tall and therefore shows some 2,6
 *                       times more map than the zoom level suggests.
 *   MAP_PERF_LABEL=…    written into the report, so two runs can be told apart.
 */

const RUN = process.env.MAP_PERF === '1'
const CPU_THROTTLE = Number(process.env.MAP_PERF_CPU ?? 1)
const WIDTH = Number(process.env.MAP_PERF_WIDTH ?? 1920)
const HEIGHT = Number(process.env.MAP_PERF_HEIGHT ?? 1080)
const LABEL = process.env.MAP_PERF_LABEL ?? 'baseline'
/**
 * Answer every boundary request at one resolution, whatever the zoom.
 *
 * Not a setting the app has — a probe. It is how "would a coarser copy have
 * done here, and by how much" gets a number instead of an argument; the third
 * stage between fine and coarse was decided on exactly this.
 */
const FORCE_RESOLUTION = process.env.MAP_PERF_RESOLUTION as BoundaryResolution | undefined

/** How many pointer steps one measured pan is, and how far each one moves. */
const DRAG_STEPS = 24
const DRAG_PX = 9

/** Long enough for the 250 ms viewport debounce plus the request it triggers. */
const SETTLE_MS = 800

function write(name: string, payload: unknown): void {
  const out = path.resolve(import.meta.dirname, '../test-results')
  mkdirSync(out, { recursive: true })
  const file = path.join(out, name)
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad aus einer Env-Variable dieses Benchmarks
  writeFileSync(file, JSON.stringify(payload, null, 2))
  // eslint-disable-next-line no-console -- dito
  console.log(`written: ${file}\n`)
}

async function metrics(cdp: CDPSession): Promise<Record<string, number>> {
  const { metrics: values } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(values.map((metric) => [metric.name, metric.value]))
}

/** The view's width as a share of the country — the map's own staging unit. */
async function span(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('svg[role="img"]')
    const box = el?.getAttribute('viewBox')?.split(/\s+/).map(Number)
    // The full width is the coordinate system the artefact was built in.
    return box ? box[2]! / 12000 : 1
  })
}

interface Row {
  span: number
  /** viewBox units per CSS pixel, as the component computes it. */
  perPixel: number
  /** What the view actually shows, in km — not what the zoom level says. */
  visibleKm: number
  resolution: BoundaryResolution | null
  /** Vertices in the DOM right now, per layer. */
  drawn: { state: number; district: number; areas: number }
  districtOpacity: number
  /** Text nodes the label pass placed. */
  labels: number
  /** Frame intervals during the pan, in ms. */
  frames: { median: number; p95: number; max: number; long: number; count: number }
  /** Main-thread time the pan spent, in ms. */
  cost: { task: number; layout: number; style: number; script: number }
}

/** Pan once, and measure what it cost. */
async function probe(page: Page, cdp: CDPSession, log: BoundaryRequestLog[]): Promise<Row> {
  await page.waitForTimeout(SETTLE_MS)

  const state = await page.evaluate(() => {
    const svg = document.querySelector('svg[role="img"]')!
    const box = svg.getAttribute('viewBox')!.split(/\s+/).map(Number)
    const rect = svg.getBoundingClientRect()
    const vertices = (selector: string) =>
      [...document.querySelectorAll(selector)].reduce(
        (sum, el) => sum + ((el.getAttribute('d') ?? '').match(/-?\d+/g) ?? []).length / 2,
        0,
      )
    const districtEl = document.querySelector('.map-district')
    // `unit` as the component computes it: whichever axis ran out first.
    const unit = Math.max(box[2]! / rect.width, box[3]! / rect.height)
    return {
      spanValue: box[2]! / 12000,
      unit,
      visibleKm: (rect.width * unit * 640) / 12000,
      district: vertices('.map-district'),
      stateLayer: vertices('.map-state'),
      areas: vertices('.areas path'),
      districtOpacity: districtEl ? Number(getComputedStyle(districtEl).opacity) : 0,
      labels: document.querySelectorAll('svg text').length,
    }
  })

  const before = await metrics(cdp)
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __sampling: boolean }
    w.__frames = []
    w.__sampling = true
    const tick = (t: number) => {
      w.__frames.push(t)
      if (w.__sampling) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  // A pan out and back, so the next zoom step starts from the same place.
  const rect = (await page.locator('svg[role="img"]').boundingBox())!
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 1; i <= DRAG_STEPS; i++) {
    const back = i > DRAG_STEPS / 2
    const offset = back ? DRAG_STEPS - i : i
    await page.mouse.move(cx + offset * DRAG_PX, cy + offset * (DRAG_PX / 3))
  }
  await page.mouse.up()

  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __sampling: boolean }
    w.__sampling = false
    const gaps: number[] = []
    for (let i = 1; i < w.__frames.length; i++) gaps.push(w.__frames[i]! - w.__frames[i - 1]!)
    gaps.sort((a, b) => a - b)
    const at = (q: number) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))] ?? 0
    return {
      median: at(0.5),
      p95: at(0.95),
      max: gaps[gaps.length - 1] ?? 0,
      long: gaps.filter((gap) => gap > 32).length,
      count: gaps.length,
    }
  })
  const after = await metrics(cdp)

  // Which resolution the layer now on screen came from — the mock records it.
  const last = [...log].reverse().find((entry) => entry.perLevel.district)
  return {
    span: state.spanValue,
    perPixel: state.unit,
    visibleKm: state.visibleKm,
    resolution: last ? last.resolution : null,
    drawn: { state: state.stateLayer, district: state.district, areas: state.areas },
    districtOpacity: state.districtOpacity,
    labels: state.labels,
    frames,
    cost: {
      task: (after.TaskDuration - before.TaskDuration) * 1000,
      layout: (after.LayoutDuration - before.LayoutDuration) * 1000,
      style: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
      script: (after.ScriptDuration - before.ScriptDuration) * 1000,
    },
  }
}

function report(rows: Row[]): void {
  const pad = (value: string | number, width: number) => String(value).padStart(width)
  const lines = [
    '',
    `map pan benchmark — ${LABEL} — ${WIDTH}x${HEIGHT}, CPU x${CPU_THROTTLE}`,
    '',
    'span  visible  perPx  res     kreis-op  drawn vertices          labels  frame ms (med/p95/max, >32ms)  main-thread ms (task/layout/style/script)',
    '-'.repeat(155),
  ]
  for (const row of rows) {
    lines.push(
      [
        row.span.toFixed(3),
        pad(`${row.visibleKm.toFixed(0)}km`, 8),
        pad(row.perPixel.toFixed(2), 6),
        pad(row.resolution ?? '—', 7),
        pad(row.districtOpacity.toFixed(2), 9),
        pad(
          `${row.drawn.state + row.drawn.district + row.drawn.areas}` +
            ` (K ${row.drawn.district} / L ${row.drawn.state})`,
          24,
        ),
        pad(row.labels, 7),
        pad(
          `${row.frames.median.toFixed(1)}/${row.frames.p95.toFixed(1)}/${row.frames.max.toFixed(0)}, ${row.frames.long}/${row.frames.count}`,
          29,
        ),
        pad(
          `${row.cost.task.toFixed(0)}/${row.cost.layout.toFixed(0)}/${row.cost.style.toFixed(0)}/${row.cost.script.toFixed(0)}`,
          20,
        ),
      ].join('  '),
    )
  }
  lines.push('')
  // eslint-disable-next-line no-console -- das ist die Ausgabe des Benchmarks
  console.log(lines.join('\n'))

  write(`map-perf-${LABEL}.json`, {
    label: LABEL,
    width: WIDTH,
    height: HEIGHT,
    cpu: CPU_THROTTLE,
    rows,
  })
}

function reportVariants(rows: (Row & { variant: string })[]): void {
  const base = rows[0]!
  const lines = [
    '',
    `Kreis stroke, at span ${base.span.toFixed(3)} (${base.visibleKm.toFixed(0)} km visible, ` +
      `${base.drawn.district} vertices) — ${LABEL} — CPU x${CPU_THROTTLE}`,
    '',
    'variant                  frame ms (med/p95/max, >32ms)   main-thread ms   vs. as shipped',
    '-'.repeat(95),
  ]
  for (const row of rows) {
    const share = base.cost.task > 0 ? row.cost.task / base.cost.task : 1
    lines.push(
      [
        row.variant.padEnd(22),
        `${row.frames.median.toFixed(1)}/${row.frames.p95.toFixed(1)}/${row.frames.max.toFixed(0)}, ${row.frames.long}/${row.frames.count}`.padStart(
          29,
        ),
        row.cost.task.toFixed(0).padStart(14),
        `${(share * 100).toFixed(0)} %`.padStart(16),
      ].join('  '),
    )
  }
  lines.push('')
  // eslint-disable-next-line no-console -- das ist die Ausgabe des Benchmarks
  console.log(lines.join('\n'))
  write(`map-perf-stroke-${LABEL}.json`, { label: LABEL, cpu: CPU_THROTTLE, rows })
}

test.describe('Karte — Performance', () => {
  test.skip(!RUN, 'benchmark; set MAP_PERF=1 to run')

  test.use({ viewport: { width: WIDTH, height: HEIGHT } })

  test.describe.configure({ mode: 'serial', timeout: 300_000 })

  test('what one pan costs at every zoom step', async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
    const boundaryLog = await mockRealMapEndpoints(page, RHEIN_MAIN_PLZ, {
      forceResolution: FORCE_RESOLUTION,
    })
    await navigateClientSide(page, '/karte')

    const svg = page.locator('svg[role="img"]')
    await expect(svg).toBeVisible()
    await expect(page.locator('.areas path')).toHaveCount(RHEIN_MAIN_PLZ.length)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    if (CPU_THROTTLE > 1) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })
    }

    const zoomIn = page.getByRole('button', { name: 'Karte vergrößern' })
    const zoomOut = page.getByRole('button', { name: 'Karte verkleinern' })

    // Start at the country and walk in, which is the reader's own path to the
    // scale that hurts — and the order in which the layers arrive.
    for (let i = 0; i < 12; i++) {
      if ((await span(page)) > 0.55) break
      await zoomOut.click()
    }

    const rows: Row[] = []
    for (let step = 0; step < 12; step++) {
      const current = await span(page)
      rows.push(await probe(page, cdp, boundaryLog))
      if (current < 0.035) break
      await zoomIn.click()
    }

    report(rows)
  })

  /**
   * The same pan, at one fixed zoom, with one property of the border stroke
   * taken away at a time.
   *
   * The first benchmark says where the cost is — the scale at which the Kreis
   * layer is drawn fine — and that the main thread spends it in paint rather
   * than in script or layout. It cannot say *which* part of painting: 135.000
   * vertices, a dash pattern that has to be walked along every one of them, and
   * a `non-scaling-stroke` that forces the whole thing to be re-stroked in
   * device space on every viewBox change are three separate charges on the same
   * bill, and the fix for each is a different one.
   *
   * So each is switched off on its own, by overriding the rule rather than by
   * editing the component: the measurement has to be of the code as it ships.
   * `none` is the floor — what the map costs with no Kreis border at all.
   */
  test('what the Kreis stroke is made of', async ({ page }) => {
    await loginAs(page, DEFAULT_USER)
    const boundaryLog = await mockRealMapEndpoints(page, RHEIN_MAIN_PLZ, {
      forceResolution: FORCE_RESOLUTION,
    })
    await navigateClientSide(page, '/karte')
    await expect(page.locator('.areas path')).toHaveCount(RHEIN_MAIN_PLZ.length)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    if (CPU_THROTTLE > 1) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })
    }

    // Down to the scale the first benchmark found the wall at.
    const zoomIn = page.getByRole('button', { name: 'Karte vergrößern' })
    const zoomOut = page.getByRole('button', { name: 'Karte verkleinern' })
    for (let i = 0; i < 12; i++) {
      if ((await span(page)) > 0.55) break
      await zoomOut.click()
    }
    for (let i = 0; i < 12; i++) {
      if ((await span(page)) < 0.2) break
      await zoomIn.click()
    }
    await page.waitForTimeout(SETTLE_MS)

    // Every variant is one stylesheet, swapped in place, so nothing but the
    // property under test differs between two measurements.
    const variants: { name: string; css: string }[] = [
      { name: 'as shipped', css: '' },
      { name: 'no dasharray', css: '.map-district { stroke-dasharray: none; }' },
      {
        // The stroke then scales with the map, which is not what the design
        // wants — the component would compute a width from `unit` instead.
        // What is being measured is the cost of the vector-effect itself.
        name: 'no non-scaling-stroke',
        css: '.map-district { vector-effect: none; stroke-width: 2; }',
      },
      {
        name: 'neither',
        css: '.map-district { stroke-dasharray: none; vector-effect: none; stroke-width: 2; }',
      },
      { name: 'no Kreis layer', css: '.map-district { display: none; }' },
    ]

    const rows: (Row & { variant: string })[] = []
    for (const variant of variants) {
      const handle = await page.addStyleTag({ content: variant.css || '/* as shipped */' })
      await page.waitForTimeout(200)
      rows.push({ ...(await probe(page, cdp, boundaryLog)), variant: variant.name })
      await handle.evaluate((el) => el.remove())
    }

    reportVariants(rows)
  })
})
