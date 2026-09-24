// @vitest-environment node
import '../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { dbCalls, mockDb, queueDbResults, resetDb } from '../../../../test/helpers/mock-db'

import handler, { criteriaFor } from './list.get'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const mockRecordEvent = vi.fn()
vi.mock('~~/server/helpers/events', () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<{
  members: { uid: string; name: string; email: string; status: string; activeSessions: number }[]
  total: number
  page: number
  perPage: number
}>

/** A row shaped the way the joined select returns it. */
function row(over: Record<string, unknown> = {}) {
  return {
    uid: 'u1',
    displayName: 'Anna Mustermann',
    email: 'anna.mustermann@example.de',
    role: 'user',
    loginDisabled: false,
    deletedAt: null,
    newsletter: 'subscribed',
    createdAt: new Date('2026-01-02T10:00:00.000Z'),
    lastSeenAt: new Date('2026-09-01T08:00:00.000Z'),
    activeSessions: '2',
    ...over,
  }
}

/** The two queries the handler runs, in order: the count, then the page. */
function queue(rows: unknown[], total = rows.length) {
  queueDbResults([{ value: String(total) }], rows)
}

describe('admin/members/list.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin', role: 'admin' },
    })
    vi.mocked(globalThis.getQuery).mockReturnValue({})
  })

  it('refuses anybody who is not an admin', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', role: 'user' },
    })
    await expect(fn({})).rejects.toMatchObject({ statusCode: 403 })
  })

  // The property the whole feature rests on: what leaves the server is already
  // masked. Masking in the template would leave the original one glance into
  // the network tab away.
  it('never puts a name or an address on the wire in full', async () => {
    queue([row()])
    const result = await fn({})
    expect(result.members[0]).toMatchObject({ name: 'Anna M.', email: 'an•••@ex•••.de' })
    expect(JSON.stringify(result)).not.toContain('anna.mustermann')
    expect(JSON.stringify(result)).not.toContain('Mustermann')
  })

  it('reports how many sessions would still let somebody in', async () => {
    queue([row({ activeSessions: '3' })])
    const result = await fn({})
    expect(result.members[0]!.activeSessions).toBe(3)
  })

  it('counts no sessions for a member who never had one', async () => {
    // The LEFT JOIN yields NULL for the SUM, not 0.
    queue([row({ activeSessions: null, lastSeenAt: null })])
    const result = await fn({})
    expect(result.members[0]!.activeSessions).toBe(0)
    expect(result.members[0]).toMatchObject({ lastSeenAt: null })
  })

  it.each([
    [{ deletedAt: null, loginDisabled: false }, 'active'],
    [{ deletedAt: null, loginDisabled: true }, 'blocked'],
    // Deleted wins: a member who was blocked and then removed is gone, and
    // "blocked" would invite somebody to try unblocking them.
    [{ deletedAt: new Date(), loginDisabled: true }, 'deleted'],
  ])('says in one word what %o is', async (over, status) => {
    queue([row(over)])
    const result = await fn({})
    expect(result.members[0]!.status).toBe(status)
  })

  it('still lists everybody when nothing was typed', async () => {
    queue([row()])
    await expect(fn({})).resolves.toMatchObject({ total: 1 })
  })

  it('searches names through the handler too, not only addresses', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({ q: 'muster' })
    queue([row()])
    await expect(fn({})).resolves.toMatchObject({ total: 1 })
    expect(mockRecordEvent).not.toHaveBeenCalled()
  })

  it('reads a naive timestamp from the driver as UTC, not as local time', async () => {
    // `MAX(last_seen_at)` is a raw expression and is not always mapped to a
    // Date. The bare string carries no zone — read as local time it would shift
    // every timestamp by the server's offset, which is a silent hour or two of
    // wrong in a column people use to judge "when was this member last here".
    queue([row({ lastSeenAt: '2026-09-01 08:00:00', createdAt: '2026-01-02 10:00:00' })])
    const result = await fn({})
    expect(result.members[0]).toMatchObject({
      lastSeenAt: '2026-09-01T08:00:00.000Z',
      createdAt: '2026-01-02T10:00:00.000Z',
    })
  })

  it('leaves a timestamp that does state its zone alone', async () => {
    queue([row({ lastSeenAt: '2026-09-01T08:00:00+02:00' })])
    const result = await fn({})
    expect(result.members[0]).toMatchObject({ lastSeenAt: '2026-09-01T06:00:00.000Z' })
  })

  it('passes a name search on as a pattern and an address search as a value', async () => {
    // The wiring check; the rule itself is pinned in the `criteriaFor` block
    // below, where it can be read without a database in the way.
    vi.mocked(globalThis.getQuery).mockReturnValue({ q: 'anna@example.de' })
    queue([row()])
    await fn({})
    const wheres = dbCalls().filter((c) => c.method === 'where')
    expect(wheres.length).toBeGreaterThan(0)
  })

  it.each([['active'], ['blocked'], ['deleted']])(
    'narrows the list to %s members',
    async (status) => {
      vi.mocked(globalThis.getQuery).mockReturnValue({ status })
      queue([row()])
      await expect(fn({})).resolves.toMatchObject({ total: 1 })
    },
  )

  it('pages with a fixed size the caller cannot widen', async () => {
    // A page size in the query string is an invitation to ask for all of them
    // at once — which is the shape of data this endpoint exists to avoid.
    vi.mocked(globalThis.getQuery).mockReturnValue({ page: '3', perPage: '1000' })
    queue([row()], 61)
    const result = await fn({})
    expect(result).toMatchObject({ page: 3, perPage: 25, total: 61 })
    const calls = dbCalls()
    expect(calls.find((c) => c.method === 'limit')?.args).toStrictEqual([25])
    expect(calls.find((c) => c.method === 'offset')?.args).toStrictEqual([50])
  })

  it('refuses a page number that is not one', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({ page: '0' })
    await expect(fn({})).rejects.toThrow(/greater than or equal to 1|too_small/)
  })

  it('reports an empty directory as empty, not as broken', async () => {
    queueDbResults([{ value: '0' }], [])
    await expect(fn({})).resolves.toMatchObject({ members: [], total: 0 })
  })
})

describe('criteriaFor', () => {
  // Where the privacy rule actually lives: an `@` means "exact", everything
  // else means "loose". Backwards, this hands out the directory.
  it('treats an address as exact and normalises it', () => {
    expect(criteriaFor('  ANNA.Mustermann@Example.de ', 'all')).toStrictEqual({
      status: 'all',
      email: 'anna.mustermann@example.de',
    })
  })

  it('treats a name as a loose pattern', () => {
    expect(criteriaFor('muster', 'all')).toStrictEqual({
      status: 'all',
      namePattern: '%muster%',
    })
  })

  it('never turns an address into a prefix search', () => {
    const criteria = criteriaFor('anna@example.de', 'all')
    expect(criteria.namePattern).toBeUndefined()
    expect(criteria.email).toBe('anna@example.de')
  })

  it.each([
    ['%', '%\\%%'],
    ['_', '%\\_%'],
    ['100%_sicher', '%100\\%\\_sicher%'],
    ['a\\b', '%a\\\\b%'],
  ])('defuses the wildcard in %s', (term, pattern) => {
    // `%` alone would otherwise match the whole directory.
    expect(criteriaFor(term, 'all').namePattern).toBe(pattern)
  })

  it.each([[''], ['   ']])('asks for no term at all when given %s', (term) => {
    expect(criteriaFor(term, 'active')).toStrictEqual({ status: 'active' })
  })

  it('carries the status through untouched', () => {
    expect(criteriaFor('', 'blocked').status).toBe('blocked')
  })
})
