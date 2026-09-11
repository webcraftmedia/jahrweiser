import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import MemberMap from './MemberMap.vue'

import type { MapArea, MapPlace } from '~~/shared/map'

const OUTLINE = { viewBox: '0 0 4000 5000', d: 'M0 0l4000 0 0 5000-4000 0z' }

function area(plz: string, count: number, overrides: Partial<MapArea> = {}): MapArea {
  return {
    plz,
    ort: `Ort ${plz}`,
    count,
    d: 'M0 0l10 0 0 10z',
    cx: 500,
    cy: 500,
    size: 900,
    ...overrides,
  }
}

function place(name: string, x: number, y: number, rank = 1000): MapPlace {
  return { name, x, y, rank }
}

function mount(areas: MapArea[], props: Record<string, unknown> = {}) {
  return mountSuspended(MemberMap, {
    props: { outline: OUTLINE, areas, title: 'Mitglieder je Postleitzahl', ...props },
  })
}

/** `x y w h` of the rendered viewBox. */
function box(wrapper: { find: (s: string) => { attributes: (a: string) => string | undefined } }) {
  const [x = 0, y = 0, w = 0, h = 0] = (wrapper.find('svg').attributes('viewBox') ?? '')
    .split(' ')
    .map(Number)
  return { x, y, w, h }
}

describe('Component: MemberMap', () => {
  it('draws one shape and one dot per postal code', async () => {
    const wrapper = await mount([area('64673', 3), area('10115', 5, { cx: 2900, cy: 900 })])
    expect(wrapper.findAll('.areas path')).toHaveLength(2)
    expect(wrapper.findAll('.dots circle')).toHaveLength(2)
  })

  it.each([
    [1, 'step-1'],
    [2, 'step-2'],
    [3, 'step-2'],
    [4, 'step-3'],
    [7, 'step-3'],
    [8, 'step-4'],
    [16, 'step-5'],
    [400, 'step-5'],
  ])('puts %i members in %s of the ramp', async (count, step) => {
    // The breaks are fixed, not derived from the data: a postal code must not
    // change colour because somewhere else grew.
    const wrapper = await mount([area('64673', count)])
    expect(wrapper.find('.areas path').classes()).toContain(step)
    expect(wrapper.find('.dots circle').classes()).toContain(step)
  })

  it('sizes the dots by the square root of the count, so area reads as the number', async () => {
    const wrapper = await mount([
      area('64673', 4),
      area('10115', 16, { cx: 2900, cy: 900 }),
      area('01067', 64, { cx: 3100, cy: 2000 }),
    ])
    const radii = wrapper
      .findAll('.dots circle')
      .map((circle) => Number(circle.attributes('r')))
      .sort((a, b) => a - b)
    // 5 + 2.5·√count, whatever the zoom happens to scale that by.
    const [small] = radii as [number, number, number]
    expect(radii.map((r) => Number((r / small).toFixed(3)))).toStrictEqual([1, 1.5, 2.5])
  })

  it('never draws a dot smaller than the number it has to hold', async () => {
    // Below that floor the number would spill onto the map, and could no longer
    // be coloured for contrast against the dot it belongs to.
    const wrapper = await mount([area('64673', 1)])
    const radius = Number(wrapper.find('.dots circle').attributes('r'))
    const fontSize = Number(
      /font-size:\s*([\d.]+)/.exec(wrapper.find('.labels').attributes('style') ?? '')?.[1] ?? 0,
    )
    expect(fontSize).toBeGreaterThan(0)
    expect(radius).toBeGreaterThan(fontSize * 0.7)
  })

  it('paints the large areas first, so a city inside one stays visible', async () => {
    const wrapper = await mount([area('10115', 5, { size: 4 }), area('64673', 1, { size: 90000 })])
    expect(wrapper.findAll('.areas path').map((p) => p.classes().join())).toStrictEqual([
      expect.stringContaining('step-1'),
      expect.stringContaining('step-3'),
    ])
  })

  it('labels every postal code where there is room', async () => {
    const wrapper = await mount([
      area('64673', 3, { cx: 400, cy: 400 }),
      area('10115', 5, { cx: 2900, cy: 900 }),
      area('01067', 2, { cx: 3100, cy: 3000 }),
    ])
    expect(wrapper.findAll('.labels text').map((t) => t.text())).toStrictEqual(['5', '3', '2'])
  })

  describe('dots that would cover each other', () => {
    // Zoomed out to the country, neighbouring postal codes are closer together
    // than their dots are wide. One circle used to land on top of another and
    // the label pass dropped whichever number lost — so the map said "2" where
    // three members live, with nothing to say anything was missing.
    it('merges them into one dot carrying the sum', async () => {
      const wrapper = await mount([area('64673', 3), area('10115', 9)])
      expect(wrapper.findAll('.dots circle')).toHaveLength(1)
      expect(wrapper.findAll('.labels text').map((t) => t.text())).toStrictEqual(['12'])
    })

    it('leaves the shapes and the table one per postal code', async () => {
      // The dot is a mark on the map, not the datum. Nothing is summarised away
      // for a reader who never sees the map.
      const wrapper = await mount([area('64673', 3), area('10115', 9)])
      expect(wrapper.findAll('.areas path')).toHaveLength(2)
      const table = wrapper.find('table').text()
      expect(table).toContain('64673')
      expect(table).toContain('10115')
    })

    it('grows and colours the merged dot like any other dot of that count', async () => {
      const merged = await mount([area('64673', 3), area('10115', 9)])
      const alone = await mount([area('64673', 12)])
      expect(merged.find('.dots circle').attributes('r')).toBe(
        alone.find('.dots circle').attributes('r'),
      )
      expect(merged.find('.dots circle').classes()).toStrictEqual(
        alone.find('.dots circle').classes(),
      )
    })

    // Whether two dots overlap depends on the zoom, and the opening zoom is
    // fitted to the areas themselves — so every case here needs one postal code
    // far enough away to keep the map opened wide.
    const FAR = area('10115', 1, { cx: 3600, cy: 4200 })

    it('merges transitively, so nothing is left overlapping', async () => {
      // A over B and B over C has to become one dot: leaving A and C apart
      // would leave them covering each other, which is the bug.
      const wrapper = await mount([
        area('64673', 1, { cx: 500, cy: 500 }),
        area('64625', 1, { cx: 560, cy: 500 }),
        area('64678', 1, { cx: 620, cy: 500 }),
        FAR,
      ])
      expect(wrapper.findAll('.dots circle')).toHaveLength(2)
      expect(wrapper.findAll('.labels text').map((t) => t.text())).toStrictEqual(['3', '1'])
    })

    it('puts the merged dot where most of the members are', async () => {
      const wrapper = await mount([
        area('64673', 9, { cx: 500, cy: 500 }),
        area('64625', 1, { cx: 560, cy: 500 }),
        FAR,
      ])
      // Sorted biggest first, so the merged one is the first circle.
      const cx = Number(wrapper.find('.dots circle').attributes('cx'))
      expect(cx).toBeGreaterThan(500)
      // A tenth of the way, not halfway.
      expect(cx).toBeLessThan(510)
    })

    it('leaves postal codes that do not overlap alone', async () => {
      const wrapper = await mount([
        area('64673', 3, { cx: 400, cy: 400 }),
        area('10115', 5, { cx: 2900, cy: 900 }),
      ])
      expect(wrapper.findAll('.dots circle')).toHaveLength(2)
      expect(wrapper.findAll('.labels text').map((t) => t.text())).toStrictEqual(['5', '3'])
    })

    it('comes apart again on the way in', async () => {
      // Nothing here decides a scale: the dots keep their size on screen, so
      // they shrink in map units as the map grows and the overlap stops.
      const wrapper = await mount([
        area('64673', 1, { cx: 500, cy: 500 }),
        area('64625', 1, { cx: 560, cy: 500 }),
        FAR,
      ])
      expect(wrapper.findAll('.dots circle')).toHaveLength(2)
      for (let i = 0; i < 6; i++) {
        await wrapper.find('button[title="components.MemberMap.zoom-in"]').trigger('click')
      }
      expect(wrapper.findAll('.dots circle')).toHaveLength(3)
      expect(wrapper.findAll('.labels text').map((t) => t.text())).toStrictEqual(['1', '1', '1'])
    })
  })

  describe('framing', () => {
    it('opens on what the members cover, not on the whole country', async () => {
      const wrapper = await mount([
        area('64673', 3, { cx: 1000, cy: 1000 }),
        area('10115', 5, { cx: 1400, cy: 1600 }),
      ])
      const view = box(wrapper)
      expect(view.w).toBeLessThan(4000)
      // Every member is inside it, with room to spare.
      expect(view.x).toBeLessThan(1000)
      expect(view.x + view.w).toBeGreaterThan(1400)
      expect(view.y).toBeLessThan(1000)
      expect(view.y + view.h).toBeGreaterThan(1600)
    })

    it('shows the whole country when there is nothing to fit', async () => {
      expect(box(await mount([]))).toMatchObject({ x: 0, y: 0, w: 4000, h: 5000 })
    })

    it('zooms in and out from there', async () => {
      const wrapper = await mount([
        area('64673', 3, { cx: 1000, cy: 1000 }),
        area('10115', 5, { cx: 1400, cy: 1600 }),
      ])
      const start = box(wrapper).w
      await wrapper.find('button[aria-label="components.MemberMap.zoom-in"]').trigger('click')
      expect(box(wrapper).w).toBeLessThan(start)
      await wrapper.find('button[aria-label="components.MemberMap.zoom-out"]').trigger('click')
      expect(box(wrapper).w).toBeCloseTo(start, 5)
    })

    it('does not zoom out past the country', async () => {
      const wrapper = await mount([area('64673', 3)])
      const out = wrapper.find('button[aria-label="components.MemberMap.zoom-out"]')
      for (let i = 0; i < 12; i++) await out.trigger('click')
      expect(box(wrapper)).toMatchObject({ x: 0, y: 0, w: 4000 })
    })

    it('keeps the marks the same size on screen while the map grows', async () => {
      // A dot that scales with the zoom stops being a dot.
      const wrapper = await mount([area('64673', 4)])
      const before = Number(wrapper.find('.dots circle').attributes('r'))
      const view = box(wrapper).w
      await wrapper.find('button[aria-label="components.MemberMap.zoom-in"]').trigger('click')
      const after = Number(wrapper.find('.dots circle').attributes('r'))
      expect(after / before).toBeCloseTo(box(wrapper).w / view, 5)
    })

    it('pans by dragging', async () => {
      const wrapper = await mount([
        area('64673', 3, { cx: 1000, cy: 1000 }),
        area('10115', 5, { cx: 1400, cy: 1600 }),
      ])
      const before = box(wrapper)
      const svg = wrapper.find('svg')
      await svg.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 200, clientY: 200 })
      await svg.trigger('pointermove', { pointerId: 1, clientX: 150, clientY: 170 })
      const after = box(wrapper)
      // Dragging left moves the frame right: the map follows the hand.
      expect(after.x).toBeGreaterThan(before.x)
      expect(after.y).toBeGreaterThan(before.y)
      expect(after.w).toBe(before.w)

      // Once let go, further movement does nothing.
      await svg.trigger('pointerup', { pointerId: 1 })
      await svg.trigger('pointermove', { pointerId: 1, clientX: 50, clientY: 50 })
      expect(box(wrapper)).toStrictEqual(after)
    })

    it('ignores a drag with anything but the primary button', async () => {
      const wrapper = await mount([area('64673', 3, { cx: 1000, cy: 1000 })])
      const before = box(wrapper)
      const svg = wrapper.find('svg')
      await svg.trigger('pointerdown', { button: 2, pointerId: 1, clientX: 200, clientY: 200 })
      await svg.trigger('pointermove', { pointerId: 1, clientX: 100, clientY: 100 })
      expect(box(wrapper)).toStrictEqual(before)
    })

    it('zooms on the wheel, towards what is under the pointer', async () => {
      const wrapper = await mount([
        area('64673', 3, { cx: 1000, cy: 1000 }),
        area('10115', 5, { cx: 1400, cy: 1600 }),
      ])
      const before = box(wrapper)
      await wrapper.find('svg').trigger('wheel', { deltaY: -100, offsetX: 200, offsetY: 200 })
      expect(box(wrapper).w).toBeLessThan(before.w)
      await wrapper.find('svg').trigger('wheel', { deltaY: 100, offsetX: 200, offsetY: 200 })
      expect(box(wrapper).w).toBeCloseTo(before.w, 5)
    })

    it('stays put for a preview nobody may steer', async () => {
      const wrapper = await mount([area('preview-0', 3, { cx: 1000, cy: 1000 })], {
        decorative: true,
      })
      const before = box(wrapper)
      const svg = wrapper.find('svg')
      await svg.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 200, clientY: 200 })
      await svg.trigger('pointermove', { pointerId: 1, clientX: 100, clientY: 100 })
      await svg.trigger('wheel', { deltaY: -100, offsetX: 200, offsetY: 200 })
      expect(box(wrapper)).toStrictEqual(before)
    })

    it('falls back to a nominal size where nothing can measure it', async () => {
      // Server-side rendering, and some test environments.
      vi.stubGlobal('ResizeObserver', undefined)
      try {
        const wrapper = await mount([area('64673', 4, { cx: 1000, cy: 1000 })])
        expect(Number(wrapper.find('.dots circle').attributes('r'))).toBeGreaterThan(0)
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('re-fits when the numbers underneath it change', async () => {
      // A different set of members covers a different part of the country;
      // holding the old frame would leave them off screen.
      const wrapper = await mount([area('64673', 3, { cx: 1000, cy: 1000 })])
      await wrapper.find('button[aria-label="components.MemberMap.zoom-in"]').trigger('click')
      const zoomed = box(wrapper)
      await wrapper.setProps({ areas: [area('20095', 5, { cx: 3000, cy: 900 })] })
      await nextTick()
      const after = box(wrapper)
      expect(after.x).not.toBe(zoomed.x)
      expect(after.x).toBeLessThan(3000)
      expect(after.x + after.w).toBeGreaterThan(3000)
    })

    it('sizes its marks against the space it was actually given', async () => {
      // How many map units go into a pixel is not knowable up front — the page
      // hands the map whatever height is left — so it is measured.
      const observers: ((entries: { contentRect: DOMRectReadOnly }[]) => void)[] = []
      class FakeObserver {
        constructor(callback: (entries: { contentRect: DOMRectReadOnly }[]) => void) {
          observers.push(callback)
        }
        observe() {}
        disconnect() {}
      }
      vi.stubGlobal('ResizeObserver', FakeObserver)
      try {
        const wrapper = await mount([area('64673', 4, { cx: 1000, cy: 1000 })])
        const assumed = Number(wrapper.find('.dots circle').attributes('r'))

        // A box that has not been laid out yet says nothing.
        observers[0]?.([{ contentRect: { width: 0, height: 0 } as DOMRectReadOnly }])
        await nextTick()
        expect(Number(wrapper.find('.dots circle').attributes('r'))).toBe(assumed)

        // A narrow one makes every map unit worth less of a pixel, so the mark
        // grows in map units to keep its size on screen.
        observers[0]?.([{ contentRect: { width: 320, height: 400 } as DOMRectReadOnly }])
        await nextTick()
        expect(Number(wrapper.find('.dots circle').attributes('r'))).toBeGreaterThan(assumed)

        // And the wheel now anchors against the measured box.
        const before = box(wrapper).w
        await wrapper.find('svg').trigger('wheel', { deltaY: -100, offsetX: 40, offsetY: 40 })
        expect(box(wrapper).w).toBeLessThan(before)
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('reports the rectangle on screen, once the panning has settled', async () => {
      vi.useFakeTimers()
      try {
        const wrapper = await mount([area('64673', 3, { cx: 1000, cy: 1000 })])
        vi.advanceTimersByTime(300)
        const emitted = wrapper.emitted('viewport')
        expect(emitted?.length).toBe(1)
        const [rect] = (emitted ?? [[]])[0] as [{ minX: number; maxX: number }]
        expect(rect.minX).toBeLessThan(1000)
        expect(rect.maxX).toBeGreaterThan(1000)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('place names', () => {
    it('writes the names of the towns it has room for', async () => {
      const wrapper = await mount(
        [area('64673', 3, { cx: 2000, cy: 2500 }), area('64625', 2, { cx: 2600, cy: 3000 })],
        { places: [place('Zwingenberg', 2000, 2500), place('Bensheim', 2600, 3000)] },
      )
      expect(wrapper.findAll('.places text').map((t) => t.text())).toStrictEqual([
        'Zwingenberg',
        'Bensheim',
      ])
    })

    it('moves a name off its own member dot rather than dropping it', async () => {
      // The town with members is the one a reader most wants named — and it is
      // also the one with a mark sitting on top of it.
      const wrapper = await mount([area('64673', 14, { cx: 2000, cy: 2500 })], {
        places: [place('Zwingenberg', 2000, 2500)],
      })
      const label = wrapper.find('.places text')
      expect(label.text()).toBe('Zwingenberg')
      const dy = Math.abs(Number(label.attributes('y') ?? 0) - 2500)
      const dx = Math.abs(Number(label.attributes('x') ?? 0) - 2000)
      expect(dy + dx).toBeGreaterThan(0)
    })

    it('leaves out what does not fit', async () => {
      const crowd = Array.from({ length: 40 }, (_, i) => place(`Ort ${i}`, 2000, 2500 + i))
      const wrapper = await mount([], { places: crowd })
      const shown = wrapper.findAll('.places text').length
      expect(shown).toBeGreaterThan(0)
      expect(shown).toBeLessThan(crowd.length)
    })

    it('stops well before the map becomes a wall of names', async () => {
      // Eighty places with room for all of them: the cap, not the collisions,
      // is what has to hold here.
      const spread = Array.from({ length: 80 }, (_, i) =>
        place(`Ort ${i}`, 200 + (i % 10) * 380, 200 + Math.floor(i / 10) * 380),
      )
      const wrapper = await mount([], { places: spread })
      expect(wrapper.findAll('.places text').length).toBeLessThanOrEqual(70)
      expect(wrapper.findAll('.places text').length).toBeGreaterThan(30)
    })

    it.each([
      ['to the side of', 3900, 1000],
      ['above or below', 1000, 4900],
    ])('ignores places %s the current view', async (_case, x, y) => {
      const wrapper = await mount([area('64673', 3, { cx: 1000, cy: 1000 })], {
        places: [place('Weit weg', x, y)],
      })
      expect(wrapper.findAll('.places text')).toHaveLength(0)
    })
  })

  it('carries the same numbers in a table, for readers who never see the map', async () => {
    const wrapper = await mount([area('64673', 3), area('10115', 5, { cx: 2900, cy: 900 })])
    const table = wrapper.find('table')
    expect(table.classes()).toContain('sr-only')
    expect(table.text()).toContain('64673')
    expect(table.text()).toContain('10115')
    // The total is spelled out rather than left to be added up by hand.
    expect(table.find('tfoot').text()).toContain('8')
  })

  it('names itself and carries a legend — the fill is the only thing saying how many', async () => {
    const wrapper = await mount([area('64673', 3)])
    expect(wrapper.find('svg').attributes('aria-label')).toBe('Mitglieder je Postleitzahl')
    expect(wrapper.find('svg').attributes('role')).toBe('img')
    expect(wrapper.findAll('figcaption .swatch')).toHaveLength(5)
  })

  it('is inert as a decorative preview', async () => {
    // The locked preview is made-up numbers. Offering them to a screen reader,
    // in a table, or to somebody who wants to zoom in would be a lie.
    const wrapper = await mount([area('preview-0', 3)], { decorative: true })
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('svg').attributes('role')).toBe('presentation')
    expect(wrapper.find('svg').attributes('aria-label')).toBeUndefined()
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.find('figcaption').exists()).toBe(false)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('says nothing about the viewport it is not steering', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = await mount([area('preview-0', 3)], { decorative: true })
      vi.advanceTimersByTime(300)
      expect(wrapper.emitted('viewport')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('draws the silhouette even before anyone is on it', async () => {
    const wrapper = await mount([])
    expect(wrapper.find('.map-country').attributes('d')).toBe(OUTLINE.d)
    expect(wrapper.findAll('.dots circle')).toHaveLength(0)
  })

  it('survives a viewBox it cannot read', async () => {
    const wrapper = await mount([area('64673', 1)], { outline: { viewBox: '', d: '' } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })
})
