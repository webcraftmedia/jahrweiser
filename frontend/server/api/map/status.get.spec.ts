// @vitest-environment node
import '../../../test/setup-server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../test/helpers/mock-db'

import handler from './status.get'

vi.mock('../../db', () => ({ useDb: () => mockDb }))

const mockLoadPlzAreas = vi.fn()
vi.mock('../../helpers/memberMap', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPlzAreas: () => mockLoadPlzAreas(),
}))

const GEOMETRY = {
  viewBox: '0 0 4000 5000',
  outline: 'M0 0l1 0z',
  areas: new Map([
    ['64673', { o: 'Zwingenberg', d: 'M0 0l1 0z', c: [1, 2] as [number, number], s: 9 }],
  ]),
}

const fn = handler as unknown as (e: unknown) => Promise<{ hasPostalCode: boolean }>

describe('map/status.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    mockLoadPlzAreas.mockResolvedValue(GEOMETRY)
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'A', email: 'a@x.de', role: 'user' },
    })
  })

  it('requires a session', async () => {
    vi.mocked(globalThis.requireUserSession).mockRejectedValue(new Error('Unauthorized'))
    await expect(fn({})).rejects.toThrow('Unauthorized')
  })

  it('rejects when the session has no uid', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({ user: { email: 'a@x.de' } })
    await expect(fn({})).rejects.toThrow('No user context')
  })

  it.each([
    ['a postal code the map knows is on file', '64673', true],
    ['a DAV client wrote it in a decorated form', 'D-64673', true],
    ['the column is empty', '', false],
    ['the column is null', null, false],
    ['it holds nothing but spaces', '   ', false],
    // The answer decides whether the rail marks the map as incomplete, and the
    // map itself refuses for exactly these — so the marker has to stay on, or
    // it would clear itself for a member who still cannot see anything.
    ['it is not five digits', '1234', false],
    ['it matches no area at all', '99999', false],
  ])('reports %s', async (_case, postalCode, expected) => {
    queueDbResults([{ postalCode }])
    await expect(fn({})).resolves.toStrictEqual({ hasPostalCode: expected })
  })

  it('reports "no" for a member who is not in the sidecar yet', async () => {
    // Between a DAV addition and the next sync. Not an error — the rail just
    // marks the map, and the map itself says what to do.
    queueDbResults([])
    await expect(fn({})).resolves.toStrictEqual({ hasPostalCode: false })
  })

  it('falls back to "is it filled" when the artefact was never built', async () => {
    // Nothing to check against. The map page says so loudly; telling a member
    // with a postal code that theirs is missing would just be wrong.
    mockLoadPlzAreas.mockResolvedValue(null)
    queueDbResults([{ postalCode: '99999' }])
    await expect(fn({})).resolves.toStrictEqual({ hasPostalCode: true })
  })
})
