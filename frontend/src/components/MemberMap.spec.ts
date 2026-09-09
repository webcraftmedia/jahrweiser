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
  const [x, y, w, h] = (wrapper.find('svg').attributes('viewBox') ?? '').split(' ').map(Number)
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
      area('64673', 1),
      area('10115', 4, { cx: 2900, cy: 900 }),
      area('01067', 16, { cx: 3100, cy: 2000 }),
    ])
    const radii = wrapper
      .findAll('.dots circle')
      .map((circle) => Number(circle.attributes('r')))
      .sort((a, b) => a - b)
    // 5 + 2.5·√count, whatever the zoom happens to scale that by.
    const [small] = radii as [number, number, number]
    expect(radii.map((r) => Number((r / small).toFixed(3)))).toStrictEqual([1, 1.333, 2])
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

  it('drops a label that would cover one already placed, largest count first', async () => {
    // Two postal codes on top of each other: the bigger number is the one that
    // gets drawn, the other stays in the table.
    const wrapper = await mount([area('64673', 3), area('10115', 9)])
    expect(wrapper.findAll('.labels text').map((t) => t.text())).toStrictEqual(['9'])
    expect(wrapper.find('table').text()).toContain('64673')
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
      await wrapper.find('svg').trigger('wheel', { deltaY: -100, clientX: 200, clientY: 200 })
      expect(box(wrapper).w).toBeLessThan(before.w)
      await wrapper.find('svg').trigger('wheel', { deltaY: 100, clientX: 200, clientY: 200 })
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
      await svg.trigger('wheel', { deltaY: -100, clientX: 200, clientY: 200 })
      expect(box(wrapper)).toStrictEqual(before)
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
      const dy = Math.abs(Number(label.attributes('y')) - 2500)
      const dx = Math.abs(Number(label.attributes('x')) - 2000)
      expect(dy + dx).toBeGreaterThan(0)
    })

    it('leaves out what does not fit', async () => {
      const crowd = Array.from({ length: 40 }, (_, i) => place(`Ort ${i}`, 2000, 2500 + i))
      const wrapper = await mount([], { places: crowd })
      const shown = wrapper.findAll('.places text').length
      expect(shown).toBeGreaterThan(0)
      expect(shown).toBeLessThan(crowd.length)
    })

    it('ignores places outside the current view', async () => {
      const wrapper = await mount([area('64673', 3, { cx: 1000, cy: 1000 })], {
        places: [place('Weit weg', 3900, 4900)],
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
