import { mountSuspended, renderSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '../../test/helpers/stub-api'

import Page from './karte.vue'

const mock$fetch = vi.fn()
stubApi(mock$fetch)

const OUTLINE = { viewBox: '0 0 4000 5000', d: 'M0 0l4000 0 0 5000-4000 0z' }
const PAYLOAD = {
  areas: [
    { plz: '64673', ort: 'Zwingenberg', count: 3, d: 'M0 0l9 0 0 9z', cx: 500, cy: 500, size: 900 },
    { plz: '10115', ort: 'Berlin', count: 5, d: 'M0 0l2 0 0 2z', cx: 2900, cy: 900, size: 4 },
  ],
  unlocated: 0,
  located: 8,
  total: 12,
  max: 5,
}

function serving(options: { map?: unknown } = {}) {
  const { map = PAYLOAD } = options
  mock$fetch.mockImplementation((url: string) => {
    if (url === '/api/map/members') {
      return map instanceof Error ? Promise.reject(map) : Promise.resolve(map)
    }
    if (url === '/api/map/outline') return Promise.resolve(OUTLINE)
    return Promise.resolve({})
  })
}

async function mountLoaded(options: { map?: unknown } = {}) {
  serving(options)
  const wrapper = await mountSuspended(Page, { route: '/karte' })
  await vi.waitFor(() => {
    expect(mock$fetch).toHaveBeenCalledWith('/api/map/members')
    expect(wrapper.html()).not.toContain('loading-dot')
  })
  await nextTick()
  return wrapper
}

/** The 403 the endpoint answers to a member without a postal code. */
function forbidden(): Error {
  return Object.assign(new Error('Forbidden'), { statusCode: 403 })
}

describe('Page: Karte', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The map state is shared with the icon rail; reset it between tests.
    const state = useMemberMap()
    state.data.value = null
    state.outline.value = null
    state.hasPostalCode.value = null
    state.isLocked.value = false
    state.loadError.value = false
    state.loaded.value = false
    serving()
  })

  it('shows a loading state until the aggregate resolves', async () => {
    mock$fetch.mockImplementation(() => new Promise(() => {}))
    const html = await (await renderSuspended(Page, { route: '/karte' })).html()
    expect(html).toContain('loading-dot')
  })

  it('draws the map once the numbers are there', async () => {
    const wrapper = await mountLoaded()
    expect(wrapper.findAll('.areas path')).toHaveLength(2)
    expect(wrapper.find('table').text()).toContain('Zwingenberg')
  })

  it('says how many members the map actually accounts for', async () => {
    // 8 of 12 — a map that quietly leaves four people out would read as
    // complete. The numbers travel with it.
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('pages.karte.summary')
    expect(wrapper.text()).not.toContain('pages.karte.unlocated')
  })

  it('names the members whose postal code has no place on the map', async () => {
    const wrapper = await mountLoaded({ map: { ...PAYLOAD, unlocated: 2 } })
    expect(wrapper.text()).toContain('pages.karte.unlocated')
  })

  it('credits the source of the geometry — ODbL asks for it', async () => {
    const wrapper = await mountLoaded()
    expect(wrapper.text()).toContain('OpenStreetMap')
  })

  it('invites the first postal code when nobody is on the map yet', async () => {
    const wrapper = await mountLoaded({
      map: { areas: [], unlocated: 0, located: 0, total: 4, max: 0 },
    })
    expect(wrapper.text()).toContain('pages.karte.empty')
    expect(wrapper.find('.dots circle').exists()).toBe(false)
  })

  describe('without a postal code of their own', () => {
    it('shows a blurred preview and the way to unlock it', async () => {
      const wrapper = await mountLoaded({ map: forbidden() })
      expect(wrapper.text()).toContain('pages.karte.locked.title')
      expect(wrapper.find('a[href="/settings/profile"]').exists()).toBe(true)
      expect(wrapper.find('.blur-\\[5px\\]').exists()).toBe(true)
    })

    it('shows made-up numbers, and no real ones', async () => {
      // The endpoint sent nothing. Everything visible here is invented on the
      // client, hidden from assistive tech, and carries no table.
      const wrapper = await mountLoaded({ map: forbidden() })
      expect(wrapper.findAll('.dots circle').length).toBeGreaterThan(0)
      expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
      expect(wrapper.find('table').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('64673')
    })
  })

  it('reports a failure instead of drawing an empty country', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = await mountLoaded({
      map: Object.assign(new Error('boom'), { statusCode: 500 }),
    })
    expect(wrapper.find('[role="alert"]').text()).toContain('pages.karte.error')
    expect(wrapper.find('svg').exists()).toBe(false)
    consoleSpy.mockRestore()
  })
})
