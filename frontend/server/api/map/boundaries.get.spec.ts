// @vitest-environment node
import '../../../test/setup-server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import handler from './boundaries.get'

import type { BoundaryFile, MapBoundaries } from '../../../shared/map'

const mockLoadBoundaries = vi.fn()
vi.mock('../../helpers/memberMap', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadBoundaries: () => mockLoadBoundaries(),
}))

const fn = handler as unknown as (e: unknown) => Promise<MapBoundaries>

const BORDERS: BoundaryFile = {
  viewBox: '0 0 12000 16000',
  proj: { x0: 0.1, y0: 1, k: 74932 },
  levels: {
    state: {
      arcs: [[0, 0, 2000, 2000, 'M0 0l2000 2000']],
      labels: [[1000, 1000, 900000, 'Hessen']],
    },
    district: {
      arcs: [[100, 100, 300, 300, 'M100 100l200 200']],
      labels: [[200, 200, 5000, 'Kreis Bergstraße']],
    },
  },
}

describe('map/boundaries.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadBoundaries.mockResolvedValue(BORDERS)
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'A', email: 'a@x.de', role: 'user' },
    })
    vi.mocked(globalThis.getQuery).mockReturnValue({
      minX: '0',
      minY: '0',
      maxX: '3000',
      maxY: '3000',
    })
  })

  it('requires a session', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(fn({})).rejects.toThrow('Unauthorized')
  })

  it('answers every level when none was named', async () => {
    await expect(fn({})).resolves.toStrictEqual({
      state: { d: 'M0 0l2000 2000', labels: [{ name: 'Hessen', x: 1000, y: 1000, size: 900000 }] },
      district: {
        d: 'M100 100l200 200',
        labels: [{ name: 'Kreis Bergstraße', x: 200, y: 200, size: 5000 }],
      },
    })
  })

  it('answers only the levels the view has room for', async () => {
    // The map asks for the district layer only once its scale can carry it —
    // at country zoom that would be a wall of lines and 380 kB of path data.
    vi.mocked(globalThis.getQuery).mockReturnValue({
      minX: '0',
      minY: '0',
      maxX: '3000',
      maxY: '3000',
      levels: 'state',
    })
    const answer = await fn({})
    expect(Object.keys(answer)).toStrictEqual(['state'])
  })

  it('asks for each level once, however often it was named', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({
      minX: '0',
      minY: '0',
      maxX: '3000',
      maxY: '3000',
      levels: 'state, state ,district',
    })
    const answer = await fn({})
    expect(Object.keys(answer)).toStrictEqual(['state', 'district'])
  })

  it('leaves out what lies outside the rectangle', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({
      minX: '8000',
      minY: '8000',
      maxX: '9000',
      maxY: '9000',
    })
    await expect(fn({})).resolves.toStrictEqual({
      state: { d: '', labels: [] },
      district: { d: '', labels: [] },
    })
  })

  it.each([
    ['a rectangle it cannot read', { minX: 'links' }],
    [
      'a level that does not exist',
      { minX: '0', minY: '0', maxX: '1', maxY: '1', levels: 'gemeinde' },
    ],
    ['no level at all', { minX: '0', minY: '0', maxX: '1', maxY: '1', levels: '' }],
  ])('rejects %s', async (_case, query) => {
    vi.mocked(globalThis.getQuery).mockReturnValue(query)
    await expect(fn({})).rejects.toThrow(ZodError)
  })

  it('answers empty when the artefact was never built', async () => {
    // A map without borders is still a map — and the areas endpoint is the one
    // that logs a missing build.
    mockLoadBoundaries.mockResolvedValue(null)
    await expect(fn({})).resolves.toStrictEqual({})
  })
})
