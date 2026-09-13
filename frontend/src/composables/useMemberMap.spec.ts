import { beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '../../test/helpers/stub-api'

import { useMemberMap } from './useMemberMap'

const mock$fetch = vi.fn()
stubApi(mock$fetch)

const OUTLINE = { viewBox: '0 0 4000 5000', d: 'M0 0z' }
const PLACES = [{ name: 'Zwingenberg', x: 500, y: 500, rank: 7291 }]
const BORDERS = {
  state: { d: 'M0 0l100 0', labels: [{ name: 'Hessen', x: 500, y: 500, size: 900 }] },
  district: { d: 'M0 10l100 0', labels: [] },
}
const VIEW = { minX: 400, minY: 400, maxX: 600, maxY: 600 }
const PAYLOAD = {
  areas: [{ plz: '64673', ort: 'Zwingenberg', count: 3, d: 'M0 0z', cx: 1, cy: 2, size: 900 }],
  unlocated: 0,
  located: 3,
  total: 5,
  max: 3,
}

/** Answer both requests the page makes; `map` may be a rejection. */
function serving(options: { map?: unknown; status?: unknown } = {}) {
  const { map = PAYLOAD, status = { hasPostalCode: true } } = options
  mock$fetch.mockImplementation((url: string) => {
    if (url === '/api/map/members') {
      return map instanceof Error ? Promise.reject(map) : Promise.resolve(map)
    }
    if (url === '/api/map/status') return Promise.resolve(status)
    if (url === '/api/map/places') return Promise.resolve(PLACES)
    if (url === '/api/map/outline') return Promise.resolve(OUTLINE)
    if (url === '/api/map/boundaries') return Promise.resolve(BORDERS)
    return Promise.resolve({})
  })
}

/** The 403 the endpoint answers to a member without a postal code. */
function forbidden(): Error {
  return Object.assign(new Error('Forbidden'), { statusCode: 403 })
}

describe('useMemberMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // useState keys are shared across calls, so reset the store between tests.
    const state = useMemberMap()
    state.data.value = null
    state.outline.value = null
    state.hasPostalCode.value = null
    state.isLocked.value = false
    state.loadError.value = false
    state.loaded.value = false
    state.places.value = []
    state.boundaries.value = {}
    useState<unknown>('member-map-place-box', () => null).value = null
    useState<unknown>('member-map-boundary-box', () => ({})).value = {}
    useState('member-map-status-loaded', () => false).value = false
    useState<Promise<void> | null>('member-map-status-inflight', () => null).value = null
    serving()
  })

  describe('status', () => {
    it('shares one request between the two rail instances', async () => {
      // Desktop and mobile rail both mount before the first response arrives.
      mock$fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({ hasPostalCode: true })
            }, 10)
          }),
      )
      const { loadStatus } = useMemberMap()
      await Promise.all([loadStatus(), loadStatus()])
      expect(mock$fetch).toHaveBeenCalledTimes(1)
    })

    it('asks once and remembers the answer', async () => {
      const { hasPostalCode, loadStatus } = useMemberMap()
      await loadStatus()
      await loadStatus()
      expect(hasPostalCode.value).toBe(true)
      expect(mock$fetch).toHaveBeenCalledTimes(1)
    })

    it('asks again when forced', async () => {
      const { loadStatus } = useMemberMap()
      await loadStatus()
      await loadStatus(true)
      expect(mock$fetch).toHaveBeenCalledTimes(2)
    })

    it('reports a missing postal code', async () => {
      serving({ status: { hasPostalCode: false } })
      const { hasPostalCode, loadStatus } = useMemberMap()
      await loadStatus()
      expect(hasPostalCode.value).toBe(false)
    })

    it('leaves it unknown when the request fails', async () => {
      // Not "no postal code": that would put a marker on the rail that nothing
      // the member does can clear.
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockRejectedValue(new Error('500'))
      const { hasPostalCode, loadStatus } = useMemberMap()
      await loadStatus()
      expect(hasPostalCode.value).toBeNull()
      consoleSpy.mockRestore()
    })
  })

  describe('place names', () => {
    it('asks for a region bigger than the view, so panning needs no request', async () => {
      const { places, loadPlaces } = useMemberMap()
      await loadPlaces(VIEW)
      expect(places.value).toStrictEqual(PLACES)
      const [, options] = mock$fetch.mock.calls.find(([url]) => url === '/api/map/places') ?? []
      const box = (options as { query: typeof VIEW }).query
      expect(box.minX).toBeLessThan(VIEW.minX)
      expect(box.maxX).toBeGreaterThan(VIEW.maxX)
      expect(box.minY).toBeLessThan(VIEW.minY)
      expect(box.maxY).toBeGreaterThan(VIEW.maxY)
    })

    it('says nothing again while the view stays inside what was fetched', async () => {
      const { loadPlaces } = useMemberMap()
      await loadPlaces(VIEW)
      // Panned a little and zoomed a little — still inside, still coarse
      // enough that the last answer holds.
      await loadPlaces({ minX: 420, minY: 420, maxX: 590, maxY: 590 })
      expect(mock$fetch.mock.calls.filter(([url]) => url === '/api/map/places')).toHaveLength(1)
    })

    it('asks again once the view has moved off the region', async () => {
      const { loadPlaces } = useMemberMap()
      await loadPlaces(VIEW)
      await loadPlaces({ minX: 3000, minY: 3000, maxX: 3200, maxY: 3200 })
      expect(mock$fetch.mock.calls.filter(([url]) => url === '/api/map/places')).toHaveLength(2)
    })

    it('asks again once it has been zoomed in far enough for smaller places', async () => {
      // The last answer was picked for a wider frame; at this zoom there is
      // room for names it left out.
      const { loadPlaces } = useMemberMap()
      await loadPlaces(VIEW)
      await loadPlaces({ minX: 495, minY: 495, maxX: 505, maxY: 505 })
      expect(mock$fetch.mock.calls.filter(([url]) => url === '/api/map/places')).toHaveLength(2)
    })

    it('keeps the map usable when the names cannot be fetched', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockRejectedValue(new Error('500'))
      const { places, loadPlaces } = useMemberMap()
      await loadPlaces(VIEW)
      expect(places.value).toStrictEqual([])
      // The region is given back, so the next view tries again.
      serving()
      await loadPlaces(VIEW)
      expect(places.value).toStrictEqual(PLACES)
      consoleSpy.mockRestore()
    })
  })

  describe('administrative borders', () => {
    const calls = () => mock$fetch.mock.calls.filter(([url]) => url === '/api/map/boundaries')

    it('asks only for the levels the map said it had room for', async () => {
      const { boundaries, loadBoundaries } = useMemberMap()
      await loadBoundaries(VIEW, ['state'], 1)
      const [, options] = calls()[0] ?? []
      expect((options as { query: { levels: string } }).query.levels).toBe('state')
      expect(boundaries.value.state).toStrictEqual(BORDERS.state)
      expect(boundaries.value.district).toBeUndefined()
    })

    it('asks for a region bigger than the view, but a smaller one than the names get', async () => {
      // A name is a few bytes and a Kreis border a few hundred: the margin that
      // buys panning without a request is worth less here.
      const { loadBoundaries, loadPlaces } = useMemberMap()
      await loadBoundaries(VIEW, ['state'], 1)
      await loadPlaces(VIEW)
      const borderBox = (calls()[0]?.[1] as { query: typeof VIEW }).query
      const [, placeOptions] =
        mock$fetch.mock.calls.find(([url]) => url === '/api/map/places') ?? []
      const placeBox = (placeOptions as { query: typeof VIEW }).query
      expect(borderBox.minX).toBeLessThan(VIEW.minX)
      expect(borderBox.minX).toBeGreaterThan(placeBox.minX)
    })

    it('holds each level on its own region', async () => {
      // The Bundesländer were fetched for the country and still answer; the
      // Kreise are only wanted now, and only they are asked for.
      const { loadBoundaries } = useMemberMap()
      await loadBoundaries(VIEW, ['state'], 1)
      await loadBoundaries(VIEW, ['state', 'district'], 1)
      expect(calls()).toHaveLength(2)
      expect((calls()[1]?.[1] as { query: { levels: string } }).query.levels).toBe('district')
    })

    it('asks again once it has been zoomed in far enough past the last answer', async () => {
      // Both layers are capped answers to a rectangle, so a much smaller one
      // can legitimately hold more than the last reply carried.
      const { loadBoundaries } = useMemberMap()
      await loadBoundaries(VIEW, ['state'], 1)
      await loadBoundaries({ minX: 495, minY: 495, maxX: 505, maxY: 505 }, ['state'], 1)
      expect(calls()).toHaveLength(2)
    })

    it('says nothing again while the view stays inside what was fetched', async () => {
      const { loadBoundaries } = useMemberMap()
      await loadBoundaries(VIEW, ['state'], 1)
      await loadBoundaries({ minX: 420, minY: 420, maxX: 590, maxY: 590 }, ['state'], 1)
      expect(calls()).toHaveLength(1)
    })

    it('takes an empty layer for a level the artefact was built without', async () => {
      mock$fetch.mockResolvedValue({})
      const { boundaries, loadBoundaries } = useMemberMap()
      await loadBoundaries(VIEW, ['district'], 1)
      expect(boundaries.value.district).toStrictEqual({ d: '', labels: [] })
    })

    it('asks again when the view has zoomed past what the coarse copy can show', async () => {
      // The region still covers the view, but the geometry in hand is the one
      // for a scale that no longer applies.
      const { loadBoundaries } = useMemberMap()
      await loadBoundaries(VIEW, ['state'], 30)
      expect((calls()[0]?.[1] as { query: { perPixel: number } }).query.perPixel).toBe(30)
      await loadBoundaries(VIEW, ['state'], 1)
      expect(calls()).toHaveLength(2)
      // …and not again once it is the resolution already held.
      await loadBoundaries(VIEW, ['state'], 1)
      expect(calls()).toHaveLength(2)
    })

    it('keeps the map usable when the borders cannot be fetched', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mock$fetch.mockRejectedValue(new Error('500'))
      const { boundaries, loadBoundaries } = useMemberMap()
      await loadBoundaries(VIEW, ['state'], 1)
      expect(boundaries.value.state).toBeUndefined()
      // The region is given back, so the next view tries again.
      serving()
      await loadBoundaries(VIEW, ['state'], 1)
      expect(boundaries.value.state).toStrictEqual(BORDERS.state)
      consoleSpy.mockRestore()
    })
  })

  describe('map', () => {
    it('has nothing to draw before the first load', async () => {
      const { areas, loaded } = useMemberMap()
      expect(areas.value).toStrictEqual([])
      expect(loaded.value).toBe(false)
    })

    it('reports that it has answered once, whichever way it went', async () => {
      // The page renders its loading state on this rather than on isLoading,
      // which is still false during the very first paint.
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      serving({ map: new Error('500') })
      const { loaded, load } = useMemberMap()
      await load()
      expect(loaded.value).toBe(true)
      consoleSpy.mockRestore()
    })

    it('loads the aggregate together with the silhouette', async () => {
      const { data, areas, outline, isLocked, loadError, isLoading, load } = useMemberMap()
      await load()
      expect(data.value).toStrictEqual(PAYLOAD)
      expect(areas.value).toStrictEqual(PAYLOAD.areas)
      expect(outline.value).toStrictEqual(OUTLINE)
      expect(isLocked.value).toBe(false)
      expect(loadError.value).toBe(false)
      expect(isLoading.value).toBe(false)
    })

    it('keeps the silhouette across reloads — it is the same for everyone', async () => {
      const { load } = useMemberMap()
      await load()
      await load()
      expect(mock$fetch.mock.calls.filter(([url]) => url === '/api/map/outline')).toHaveLength(1)
      expect(mock$fetch.mock.calls.filter(([url]) => url === '/api/map/members')).toHaveLength(2)
    })

    it('treats the 403 as "locked", not as an error', async () => {
      serving({ map: forbidden() })
      const { data, outline, isLocked, loadError, hasPostalCode, load } = useMemberMap()
      await load()
      expect(isLocked.value).toBe(true)
      expect(loadError.value).toBe(false)
      expect(hasPostalCode.value).toBe(false)
      // Nothing real arrived — the preview the page draws is its own invention.
      expect(data.value).toBeNull()
      // The silhouette still did, or there would be nothing to blur.
      expect(outline.value).toStrictEqual(OUTLINE)
    })

    it('reads the status off the response when the client does not surface it', async () => {
      serving({ map: Object.assign(new Error('Forbidden'), { response: { status: 403 } }) })
      const { isLocked, load } = useMemberMap()
      await load()
      expect(isLocked.value).toBe(true)
    })

    it('reports any other failure as an error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      serving({ map: Object.assign(new Error('Server error'), { statusCode: 500 }) })
      const { data, isLocked, loadError, isLoading, load } = useMemberMap()
      await load()
      expect(loadError.value).toBe(true)
      expect(isLocked.value).toBe(false)
      expect(data.value).toBeNull()
      expect(isLoading.value).toBe(false)
      consoleSpy.mockRestore()
    })

    it('clears the locked state before trying again', async () => {
      serving({ map: forbidden() })
      const { isLocked, load } = useMemberMap()
      await load()
      expect(isLocked.value).toBe(true)
      serving()
      await load()
      expect(isLocked.value).toBe(false)
    })
  })
})
