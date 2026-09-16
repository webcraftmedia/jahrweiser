// @vitest-environment node
import '../../../test/setup-server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../test/helpers/mock-db'

import handler from './members.get'

import type { MapPayload } from '../../../shared/map'

vi.mock('../../db', () => ({ useDb: () => mockDb }))

const mockLoadPlzAreas = vi.fn()
vi.mock('../../helpers/memberMap', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPlzAreas: () => mockLoadPlzAreas(),
}))

const fn = handler as unknown as (e: unknown) => Promise<MapPayload>

const GEOMETRY = {
  viewBox: '0 0 4000 5000',
  areas: new Map([
    [
      '64673',
      { o: 'Zwingenberg', d: 'M0 0l10 0 0 10z', c: [100, 200] as [number, number], s: 900 },
    ],
    ['10115', { o: 'Berlin', d: 'M0 0l2 0 0 2z', c: [2900, 900] as [number, number], s: 4 }],
  ]),
}

describe('map/members.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    mockLoadPlzAreas.mockResolvedValue(GEOMETRY)
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'A', email: 'a@x.de', role: 'user' },
    })
  })

  it('requires a session — the aggregate is for members only', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(fn({})).rejects.toThrow('Unauthorized')
  })

  it('rejects when the session has no uid', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({ user: { email: 'a@x.de' } })
    await expect(fn({})).rejects.toThrow('No user context')
  })

  it.each([
    ['the member has no postal code', [{ postalCode: null }]],
    ['their postal code is empty', [{ postalCode: '  ' }]],
    ['they are not in the sidecar yet', []],
    // The gate is "can the map place you", not "is the column filled" — a code
    // nobody can draw buys no more of the aggregate than an empty one.
    ['their postal code is not five digits', [{ postalCode: '1234' }]],
    ['their postal code matches no area', [{ postalCode: '99999' }]],
  ])('refuses with no data at all when %s', async (_case, rows) => {
    // The blurred preview the page shows is invented on the client. Sending
    // the real aggregate and blurring it in CSS would be no protection at all.
    queueDbResults(rows)
    await expect(fn({})).rejects.toThrow('postal-code-required')
  })

  it('opens for a code a DAV client wrote in a decorated form', async () => {
    // "D-64673" is the same place as "64673" and is normalised everywhere else;
    // the gate must not be the one place that reads it as a stranger.
    queueDbResults([{ postalCode: 'D-64673' }], [{ postalCode: '64673', count: 1 }], [{ count: 1 }])
    await expect(fn({})).resolves.toMatchObject({ located: 1, unlocated: 0 })
  })

  it('aggregates once the member is on the map themselves', async () => {
    queueDbResults(
      [{ postalCode: '64673' }],
      [
        { postalCode: '64673', count: 2 },
        { postalCode: '10115', count: 5 },
        { postalCode: '99999', count: 1 },
      ],
      [{ count: 12 }],
    )
    const payload = await fn({})
    expect(payload.areas.map((a) => [a.plz, a.count])).toStrictEqual([
      ['10115', 5],
      ['64673', 2],
    ])
    expect(payload).toMatchObject({ located: 8, unlocated: 1, total: 12, max: 5 })
  })

  it('survives a missing total row', async () => {
    queueDbResults([{ postalCode: '64673' }], [{ postalCode: '64673', count: 1 }], [])
    await expect(fn({})).resolves.toMatchObject({ total: 0 })
  })

  it('fails loudly when the geometry artefact was never built', async () => {
    // `npm run map:build` has not run in this deployment. The page cannot draw
    // anything, so an operator should find it in the log rather than a blank map.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockLoadPlzAreas.mockResolvedValue(null)
    queueDbResults([{ postalCode: '64673' }])
    await expect(fn({})).rejects.toThrow('Map data unavailable')
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
