// @vitest-environment node
import '../../test/setup-server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AREA_FILE_KEY,
  buildMapPayload,
  loadPlaces,
  loadPlzAreas,
  lookupPostalCode,
  normalisePostalCode,
  PLACE_FILE_KEY,
  placesIn,
  resetPlzAreaCache,
} from './memberMap'

import type { LoadedAreas } from './memberMap'
import type { PlzAreaFile } from '../../shared/map'

const FILE: PlzAreaFile = {
  viewBox: '0 0 4000 5000',
  outline: 'M0 0l10 0 0 10z',
  areas: {
    '64673': { o: 'Zwingenberg', d: 'M0 0l10 0 0 10z', c: [100, 200], s: 5000 },
    '10115': { o: 'Berlin', d: 'M0 0l2 0 0 2z', c: [2900, 900], s: 4 },
    '01067': { o: 'Dresden', d: 'M0 0l4 0 0 4z', c: [3100, 2000], s: 900 },
  },
}

function geometry(): LoadedAreas {
  return {
    viewBox: FILE.viewBox,
    outline: FILE.outline,
    areas: new Map(Object.entries(FILE.areas)),
  }
}

const PLACES: [number, number, number, string][] = [
  [1000, 1000, 700000, 'Frankfurt am Main'],
  [1010, 1020, 7291, 'Zwingenberg'],
  [1015, 1025, 0, 'Rodau'],
  [3900, 4900, 3600000, 'Berlin'],
]

function storageServing(value: unknown): void {
  vi.mocked(globalThis.useStorage).mockReturnValue({
    getItem: vi.fn().mockResolvedValue(value),
  })
}

describe('normalisePostalCode', () => {
  it.each([
    ['64673', '64673'],
    ['D-64673', '64673'],
    ['64 673', '64673'],
    [' 64673 ', '64673'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalisePostalCode(input)).toBe(expected)
  })

  it.each([
    ['', 'empty'],
    ['1010', 'four digits (Vienna)'],
    ['CH-8001', 'a Swiss code'],
    ['irgendwas', 'not a code at all'],
    ['123456', 'six digits'],
  ])('has no area for %s (%s)', (input) => {
    expect(normalisePostalCode(input)).toBeNull()
  })

  it.each([null, undefined])('handles %s', (input) => {
    expect(normalisePostalCode(input)).toBeNull()
  })
})

describe('lookupPostalCode', () => {
  // The single definition of "valid postal code": what the settings form
  // accepts, what the map's gate opens for, and what the rail's marker means.
  it('names the place behind a code the geometry knows', () => {
    expect(lookupPostalCode('64673', geometry())).toStrictEqual({
      plz: '64673',
      ort: 'Zwingenberg',
    })
  })

  it('normalises before it looks up', () => {
    expect(lookupPostalCode('D-64673', geometry())).toMatchObject({ plz: '64673' })
  })

  it.each([
    ['99999', 'five digits that match no area'],
    ['1010', 'four digits'],
    ['CH-8001', 'a foreign code'],
    ['', 'nothing'],
  ])('refuses %s (%s)', (input) => {
    expect(lookupPostalCode(input, geometry())).toBeNull()
  })

  it.each([null, undefined])('handles %s', (input) => {
    expect(lookupPostalCode(input, geometry())).toBeNull()
  })
})

describe('buildMapPayload', () => {
  it('joins the counts onto the geometry, most members first', () => {
    const payload = buildMapPayload(
      [
        { postalCode: '64673', count: 3 },
        { postalCode: '10115', count: 12 },
      ],
      geometry(),
      40,
    )
    expect(payload.areas.map((a) => [a.plz, a.ort, a.count])).toStrictEqual([
      ['10115', 'Berlin', 12],
      ['64673', 'Zwingenberg', 3],
    ])
    expect(payload.areas[0]).toMatchObject({ cx: 2900, cy: 900, size: 4, d: 'M0 0l2 0 0 2z' })
    expect(payload).toMatchObject({ located: 15, unlocated: 0, total: 40, max: 12 })
  })

  it('breaks a tie on the postal code, so the order never wobbles', () => {
    const payload = buildMapPayload(
      [
        { postalCode: '64673', count: 2 },
        { postalCode: '01067', count: 2 },
      ],
      geometry(),
      2,
    )
    expect(payload.areas.map((a) => a.plz)).toStrictEqual(['01067', '64673'])
  })

  it('adds up two spellings of the same postal code', () => {
    // A DAV client that round-trips "D-64673" must not produce a second area.
    const payload = buildMapPayload(
      [
        { postalCode: '64673', count: 2 },
        { postalCode: 'D-64673', count: 1 },
      ],
      geometry(),
      3,
    )
    expect(payload.areas).toHaveLength(1)
    expect(payload.areas[0]).toMatchObject({ plz: '64673', count: 3 })
    expect(payload.max).toBe(3)
  })

  it.each([
    ['a code with no area in Germany', '99999'],
    ['a foreign code', 'A-1010'],
    ['no code at all', null],
  ])('counts %s as unlocated rather than dropping it', (_case, postalCode) => {
    const payload = buildMapPayload(
      [
        { postalCode, count: 4 },
        { postalCode: '64673', count: 1 },
      ],
      geometry(),
      5,
    )
    expect(payload).toMatchObject({ located: 5, unlocated: 4 })
    expect(payload.areas).toHaveLength(1)
  })

  it('ignores a row that counts nobody', () => {
    const payload = buildMapPayload([{ postalCode: '64673', count: 0 }], geometry(), 1)
    expect(payload).toMatchObject({ areas: [], located: 0, unlocated: 0, max: 0 })
  })
})

describe('loadPlzAreas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPlzAreaCache()
  })

  it('reads the artefact from the server assets', async () => {
    storageServing(FILE)
    const loaded = await loadPlzAreas()
    expect(loaded?.viewBox).toBe('0 0 4000 5000')
    expect(loaded?.outline).toBe('M0 0l10 0 0 10z')
    expect(loaded?.areas.get('64673')?.o).toBe('Zwingenberg')
    expect(vi.mocked(globalThis.useStorage).mock.calls[0]).toStrictEqual(['assets:server'])
  })

  it('parses it once and keeps it — the geometry never changes at runtime', async () => {
    storageServing(FILE)
    const first = await loadPlzAreas()
    await expect(loadPlzAreas()).resolves.toBe(first)
    expect(globalThis.useStorage).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['the artefact has not been generated', null],
    ['the file is there but empty', {}],
  ])('answers null when %s', async (_case, value) => {
    // A fresh checkout has no map data; that must not take the app down. The
    // endpoint turns this into a 500 with a log line naming the build script.
    storageServing(value)
    await expect(loadPlzAreas()).resolves.toBeNull()
  })

  it('looks the artefact up under the key the build script writes', async () => {
    const getItem = vi.fn().mockResolvedValue(FILE)
    vi.mocked(globalThis.useStorage).mockReturnValue({ getItem })
    await loadPlzAreas()
    expect(getItem).toHaveBeenCalledWith(AREA_FILE_KEY)
  })
})

describe('placesIn', () => {
  it('answers with what lies inside the rectangle, in the order it was given', () => {
    // The artefact is sorted by rank, so "the first ones found" are the ones
    // worth showing — no sorting needed here.
    expect(
      placesIn(PLACES, { minX: 900, minY: 900, maxX: 1100, maxY: 1100 }, 10).map((p) => p.name),
    ).toStrictEqual(['Frankfurt am Main', 'Zwingenberg', 'Rodau'])
  })

  it('stops at the limit', () => {
    expect(placesIn(PLACES, { minX: 0, minY: 0, maxX: 4000, maxY: 5000 }, 2)).toHaveLength(2)
  })

  it('has nothing to say about an empty corner of the map', () => {
    expect(placesIn(PLACES, { minX: 2000, minY: 2000, maxX: 2100, maxY: 2100 }, 10)).toStrictEqual(
      [],
    )
  })

  it('carries the rank, so the client can decide who gets the room', () => {
    const [first] = placesIn(PLACES, { minX: 900, minY: 900, maxX: 1100, maxY: 1100 }, 1)
    expect(first).toStrictEqual({ name: 'Frankfurt am Main', x: 1000, y: 1000, rank: 700000 })
  })
})

describe('loadPlaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPlzAreaCache()
  })

  it('reads the place artefact and keeps it', async () => {
    const getItem = vi.fn().mockResolvedValue({ viewBox: FILE.viewBox, places: PLACES })
    vi.mocked(globalThis.useStorage).mockReturnValue({ getItem })
    const first = await loadPlaces()
    expect(first).toHaveLength(4)
    await expect(loadPlaces()).resolves.toBe(first)
    expect(getItem).toHaveBeenCalledExactlyOnceWith(PLACE_FILE_KEY)
  })

  it.each([
    ['it has not been generated', null],
    ['the file is there but empty', {}],
  ])('answers null when %s', async (_case, value) => {
    storageServing(value)
    await expect(loadPlaces()).resolves.toBeNull()
  })
})
