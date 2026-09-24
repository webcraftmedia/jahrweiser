// @vitest-environment node
import '../../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../../../test/helpers/mock-db'

import handler from './tags.get'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const mockTagStateFor = vi.fn()
vi.mock('~~/server/helpers/userTags', () => ({
  tagStateFor: (...a: unknown[]) => mockTagStateFor(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<{ tags: unknown[] }>

describe('admin/members/[uid]/tags.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin', role: 'admin' },
    })
    vi.mocked(globalThis.getRouterParam).mockReturnValue('u1')
    mockTagStateFor.mockResolvedValue([{ name: 'vorstand', label: 'Vorstand', state: true }])
  })

  it('refuses anybody who is not an admin', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', role: 'user' },
    })
    await expect(fn({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a request without a uid', async () => {
    vi.mocked(globalThis.getRouterParam).mockReturnValue(undefined)
    await expect(fn({})).rejects.toMatchObject({ statusCode: 400 })
  })

  it('answers 404 for a uid nobody has', async () => {
    queueDbResults([])
    await expect(fn({})).rejects.toMatchObject({ statusCode: 404 })
  })

  // The point of the uid-keyed route: the address is resolved on the server, so
  // it never has to travel to the browser for the sake of a checkbox list.
  it('resolves the uid to an address without handing it out', async () => {
    queueDbResults([{ email: 'anna@example.de' }])
    const result = await fn({})
    expect(mockTagStateFor).toHaveBeenCalledWith(
      expect.anything(),
      'admin@example.de',
      'anna@example.de',
    )
    expect(JSON.stringify(result)).not.toContain('anna@example.de')
  })
})
