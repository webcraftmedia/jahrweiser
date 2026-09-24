// @vitest-environment node
import '../../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { firstDbCall, mockDb, queueDbResults, resetDb } from '../../../../../test/helpers/mock-db'

import handler from './role.post'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const mockRecordEvent = vi.fn()
vi.mock('~~/server/helpers/events', () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<{ role: string }>

const member = { uid: 'u1', deletedAt: null, loginDisabled: false, role: 'user' }

function sending(role: string) {
  vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
    (v as (d: unknown) => unknown)({ role }),
  )
}

describe('admin/members/[uid]/role.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin', role: 'admin' },
    })
    vi.mocked(globalThis.getRouterParam).mockReturnValue('u1')
    sending('admin')
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

  it('promotes a member', async () => {
    queueDbResults([member], {})
    await expect(fn({})).resolves.toStrictEqual({ role: 'admin' })
    expect(firstDbCall('set')).toStrictEqual([{ role: 'admin' }])
  })

  it('demotes an admin', async () => {
    sending('user')
    queueDbResults([{ ...member, role: 'admin' }], {})
    await expect(fn({})).resolves.toStrictEqual({ role: 'user' })
  })

  it('refuses to let an admin change their own role', async () => {
    // The straightforward way to end up with no admin at all.
    vi.mocked(globalThis.getRouterParam).mockReturnValue('a1')
    sending('user')
    queueDbResults([{ ...member, uid: 'a1', role: 'admin' }])
    await expect(fn({})).rejects.toMatchObject({ statusCode: 400 })
  })

  it.each([[{ loginDisabled: true }], [{ deletedAt: new Date() }]])(
    'refuses to promote a shut account (%o)',
    async (over) => {
      queueDbResults([{ ...member, ...over }])
      await expect(fn({})).rejects.toMatchObject({ statusCode: 409 })
    },
  )

  it('still lets a blocked admin be demoted', async () => {
    // Taking rights away from an account that is already shut must stay
    // possible — that is the direction that makes things safer.
    sending('user')
    queueDbResults([{ ...member, role: 'admin', loginDisabled: true }], {})
    await expect(fn({})).resolves.toStrictEqual({ role: 'user' })
  })

  it.each([
    ['admin', 'admin.promoted'],
    ['user', 'admin.demoted'],
  ])('records %s as %s', async (role, type) => {
    sending(role)
    queueDbResults([member], {})
    await fn({ path: '/api/admin/members/u1/role' })
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type,
      userUid: 'u1',
      actorUid: 'a1',
      event: { path: '/api/admin/members/u1/role' },
    })
  })

  it('refuses a role that does not exist', async () => {
    sending('superadmin')
    await expect(fn({})).rejects.toThrow()
  })
})
