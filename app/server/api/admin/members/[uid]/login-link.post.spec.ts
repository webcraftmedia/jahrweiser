// @vitest-environment node
import '../../../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../../../test/helpers/mock-db'

import handler from './login-link.post'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const mockRecordEvent = vi.fn()
vi.mock('~~/server/helpers/events', () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}))

const mockSendLoginLink = vi.fn()
vi.mock('~~/server/helpers/loginLink', () => ({
  sendLoginLink: (...a: unknown[]) => mockSendLoginLink(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<{ sent: boolean }>

const member = {
  uid: 'u1',
  email: 'anna@example.de',
  displayName: 'Anna Mustermann',
  deletedAt: null,
  loginDisabled: false,
}

describe('admin/members/[uid]/login-link.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin', role: 'admin' },
    })
    vi.mocked(globalThis.getRouterParam).mockReturnValue('u1')
    mockSendLoginLink.mockResolvedValue(undefined)
  })

  it('refuses anybody who is not an admin', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({ user: { uid: 'u1', role: 'user' } })
    await expect(fn({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mockSendLoginLink).not.toHaveBeenCalled()
  })

  it('refuses a request without a uid', async () => {
    vi.mocked(globalThis.getRouterParam).mockReturnValue(undefined)
    await expect(fn({})).rejects.toMatchObject({ statusCode: 400 })
  })

  it('answers 404 for a uid nobody has', async () => {
    queueDbResults([])
    await expect(fn({})).rejects.toMatchObject({ statusCode: 404 })
  })

  it('sends the link without the address ever passing through the browser', async () => {
    queueDbResults([member])
    await expect(fn({})).resolves.toStrictEqual({ sent: true })
    expect(mockSendLoginLink).toHaveBeenCalledWith(expect.anything(), member)
  })

  it.each([
    [{ loginDisabled: true }],
    [{ deletedAt: new Date() }],
  ])('refuses to send a working key to a shut account (%o)', async (over) => {
    queueDbResults([{ ...member, ...over }])
    await expect(fn({})).rejects.toMatchObject({ statusCode: 409 })
    expect(mockSendLoginLink).not.toHaveBeenCalled()
  })

  it('records the admin’s intent before the mail is attempted', async () => {
    // So that a send which throws still leaves the intent in the trail —
    // sendLoginLink writes the outcome itself.
    const order: string[] = []
    mockRecordEvent.mockImplementation(() => {
      order.push('recorded')
    })
    mockSendLoginLink.mockImplementation(() => {
      order.push('sent')
      return Promise.resolve()
    })
    queueDbResults([member])

    await fn({ path: '/api/admin/members/u1/login-link' })

    expect(order).toStrictEqual(['recorded', 'sent'])
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type: 'admin.login_link_sent',
      userUid: 'u1',
      actorUid: 'a1',
      event: { path: '/api/admin/members/u1/login-link' },
    })
  })

  it('lets a failing mail fail', async () => {
    queueDbResults([member])
    mockSendLoginLink.mockRejectedValue(new Error('Failed to send login email'))
    await expect(fn({})).rejects.toThrow('Failed to send login email')
  })
})
