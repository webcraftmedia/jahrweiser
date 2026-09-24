// @vitest-environment node
import '../../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../../../test/helpers/mock-db'

import handler from './reveal.post'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const mockRecordEvent = vi.fn()
vi.mock('~~/server/helpers/events', () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<{ email: string }>

describe('admin/members/[uid]/reveal.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin', role: 'admin' },
    })
    vi.mocked(globalThis.getRouterParam).mockReturnValue('u1')
  })

  it('refuses anybody who is not an admin', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({ user: { uid: 'u1', role: 'user' } })
    await expect(fn({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mockRecordEvent).not.toHaveBeenCalled()
  })

  it('refuses a request without a uid', async () => {
    vi.mocked(globalThis.getRouterParam).mockReturnValue(undefined)
    await expect(fn({})).rejects.toMatchObject({ statusCode: 400 })
  })

  it('answers 404 for a uid nobody has', async () => {
    queueDbResults([])
    await expect(fn({})).rejects.toMatchObject({ statusCode: 404 })
    expect(mockRecordEvent).not.toHaveBeenCalled()
  })

  it('hands out the address', async () => {
    queueDbResults([{ email: 'anna.mustermann@example.de' }])
    await expect(fn({})).resolves.toStrictEqual({ email: 'anna.mustermann@example.de' })
  })

  // The condition on which revealing is allowed at all: it is never quiet.
  it('writes the reveal into the member’s own chronicle, with the admin’s name', async () => {
    queueDbResults([{ email: 'anna.mustermann@example.de' }])
    await fn({ path: '/api/admin/members/u1/reveal' })
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type: 'admin.email_revealed',
      userUid: 'u1',
      actorUid: 'a1',
      event: { path: '/api/admin/members/u1/reveal' },
    })
  })

  it('records the reveal before handing the address over', async () => {
    const order: string[] = []
    mockRecordEvent.mockImplementation(() => {
      order.push('recorded')
    })
    queueDbResults([{ email: 'anna@example.de' }])
    await fn({})
    order.push('returned')
    expect(order).toStrictEqual(['recorded', 'returned'])
  })
})
