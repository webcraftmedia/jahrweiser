// @vitest-environment node
import '../../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { dbCalls, mockDb, queueDbResults, resetDb } from '../../../../../test/helpers/mock-db'

import handler from './events.get'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const fn = handler as unknown as (e: unknown) => Promise<{
  events: { id: number; at: string; type: string; origin: string | null; actorUid: string | null }[]
  page: number
  perPage: number
}>

const AT = new Date(Date.UTC(2026, 8, 24, 12, 0, 0))

function eventRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    at: AT,
    type: 'auth.redeem_ok',
    meta: null,
    ipPrefix: '192.0.2.0',
    actorUid: null,
    ...over,
  }
}

describe('admin/members/[uid]/events.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin', role: 'admin' },
    })
    vi.mocked(globalThis.getRouterParam).mockReturnValue('u1')
    vi.mocked(globalThis.getQuery).mockReturnValue({})
  })

  it('refuses anybody who is not an admin', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({ user: { uid: 'u1', role: 'user' } })
    await expect(fn({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a request without a uid', async () => {
    vi.mocked(globalThis.getRouterParam).mockReturnValue(undefined)
    await expect(fn({})).rejects.toMatchObject({ statusCode: 400 })
  })

  it('returns the chronicle as written', async () => {
    queueDbResults([eventRow({ meta: { reason: 'used' } })])
    const result = await fn({})
    expect(result.events[0]).toStrictEqual({
      id: 1,
      at: AT.toISOString(),
      type: 'auth.redeem_ok',
      meta: { reason: 'used' },
      origin: '192.0.2.0',
      actorUid: null,
    })
  })

  it('shows an origin the retention sweep has already blanked as absent', async () => {
    queueDbResults([eventRow({ ipPrefix: null })])
    await expect(fn({})).resolves.toMatchObject({ events: [expect.objectContaining({ origin: null })] })
  })

  it('names the admin behind an entry that was not the member’s own doing', async () => {
    queueDbResults([eventRow({ type: 'admin.blocked', actorUid: 'a1' })])
    const result = await fn({})
    expect(result.events[0]).toMatchObject({ type: 'admin.blocked', actorUid: 'a1' })
  })

  it('filters by group rather than by an exhaustive list of types', async () => {
    // So that a new event type shows up under its group without this endpoint
    // having to learn about it — the same reason the column is a varchar.
    vi.mocked(globalThis.getQuery).mockReturnValue({ group: 'auth' })
    queueDbResults([eventRow()])
    await fn({})
    expect(JSON.stringify(dbCalls().map((c) => c.method))).toContain('where')
  })

  it('refuses a group nobody defined', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({ group: 'everything' })
    await expect(fn({})).rejects.toThrow()
  })

  it('pages with a fixed size', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({ page: '2' })
    queueDbResults([])
    const result = await fn({})
    expect(result).toMatchObject({ page: 2, perPage: 50 })
    const calls = dbCalls()
    expect(calls.find((c) => c.method === 'limit')?.args).toStrictEqual([50])
    expect(calls.find((c) => c.method === 'offset')?.args).toStrictEqual([50])
  })

  it('reports an empty chronicle as empty', async () => {
    queueDbResults([])
    await expect(fn({})).resolves.toMatchObject({ events: [] })
  })
})
