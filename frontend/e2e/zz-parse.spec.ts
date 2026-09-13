import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

const BORDERS = JSON.parse(readFileSync('server/assets/map/boundaries.json', 'utf8'))
const ENGINE = (process.env.ENGINE ?? 'chromium') as 'chromium' | 'firefox'

test.use({ browserName: ENGINE })

const join = (arcs: unknown[][]) => arcs.map((a) => a[4] as string).join('')

test('cost of putting a border layer on screen', async ({ page }) => {
  await page.setContent(
    '<svg id="m" viewBox="0 0 12000 16295" style="width:390px;height:780px"><path id="p" fill="none" stroke="#333" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>',
  )
  const cases = {
    'Land, voll': join(BORDERS.levels.state.arcs),
    'Land, grob': join(BORDERS.levels.state.coarse),
    'Kreis, voll': join(BORDERS.levels.district.arcs),
    'Kreis, grob': join(BORDERS.levels.district.coarse),
  }
  for (const [label, d] of Object.entries(cases)) {
    const ms = await page.evaluate(async (path: string) => {
      const el = document.getElementById('p') as unknown as SVGPathElement
      const runs: number[] = []
      for (let i = 0; i < 8; i++) {
        el.setAttribute('d', '')
        el.getBBox()
        await new Promise<void>((r) =>
          requestAnimationFrame(() => {
            r()
          }),
        )
        const t0 = performance.now()
        el.setAttribute('d', path)
        el.getBBox()
        runs.push(performance.now() - t0)
      }
      return Math.round(runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)])
    }, d)
    console.log(
      `${ENGINE} · ${label.padEnd(12)} ${(d.length / 1024).toFixed(0).padStart(5)} kB → ${String(ms).padStart(3)} ms`,
    )
  }
  expect(true).toBe(true)
})
