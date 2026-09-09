// @vitest-environment node
import '../../../test/setup-server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './places.get'

import type { MapPlace } from '../../../shared/map'

const mockLoadPlaces = vi.fn()
vi.mock('../../helpers/memberMap', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPlaces: () => mockLoadPlaces(),
}))

const fn = handler as unknown as (e: unknown) => Promise<MapPlace[]>

const PLACES: [number, number, number, string][] = [
  [1000, 1000, 700000, 'Frankfurt am Main'],
  [1010, 1020, 7291, 'Zwingenberg'],
  [9000, 9000, 3600000, 'Berlin'],
]

describe('map/places.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadPlaces.mockResolvedValue(PLACES)
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'A', email: 'a@x.de', role: 'user' },
    })
    vi.mocked(globalThis.getQuery).mockReturnValue({
      minX: '900',
      minY: '900',
      maxX: '1100',
      maxY: '1100',
    })
  })

  it('requires a session', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(fn({})).rejects.toThrow('Unauthorized')
  })

  it('answers with what lies inside the rectangle, most important first', async () => {
    await expect(fn({})).resolves.toStrictEqual([
      { name: 'Frankfurt am Main', x: 1000, y: 1000, rank: 700000 },
      { name: 'Zwingenberg', x: 1010, y: 1020, rank: 7291 },
    ])
  })

  it('stops at the limit — the artefact is sorted, so the first found are the ones worth showing', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({
      minX: '0',
      minY: '0',
      maxX: '12000',
      maxY: '16000',
      limit: '2',
    })
    const found = await fn({})
    expect(found).toHaveLength(2)
    expect(found[0]!.name).toBe('Frankfurt am Main')
  })

  it('rejects a rectangle it cannot read', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({ minX: 'links' })
    await expect(fn({})).rejects.toThrow()
  })

  it('refuses to be asked for more than it will ever draw', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({
      minX: '0',
      minY: '0',
      maxX: '1',
      maxY: '1',
      limit: '99999',
    })
    await expect(fn({})).rejects.toThrow()
  })

  it('answers empty when the artefact was never built — a map without names is still a map', async () => {
    mockLoadPlaces.mockResolvedValue(null)
    await expect(fn({})).resolves.toStrictEqual([])
  })
})
