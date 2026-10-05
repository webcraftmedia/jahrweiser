// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { dbCalls, mockDb, queueDbResults, resetDb } from '../../test/helpers/mock-db'
import { codeHashOf } from '../helpers/loginCode'

import handler from './redeemLoginCode.post'

vi.mock('../db', () => ({ useDb: () => mockDb }))

const mockRecordEvent = vi.fn()
vi.mock('../helpers/events', () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}))

const fn = handler as unknown as (e: unknown) => Promise<unknown>

const NONCE = 'nonce'
const CODE = '123456'
const future = new Date(Date.now() + 60_000)

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    token: 'tok',
    userUid: 'u1',
    requestedAt: new Date(),
    expiresAt: future,
    consumedAt: null,
    codeHash: codeHashOf(NONCE, CODE),
    codeAttempts: 0,
    ...overrides,
  }
}

const user = {
  uid: 'u1',
  displayName: 'A',
  email: 'a@x.de',
  role: 'user',
  deletedAt: null,
  loginDisabled: false,
}

function withBody(code: string) {
  vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
    (v as (d: unknown) => unknown)({ code }),
  )
}

describe('redeemLoginCode.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    withBody(CODE)
    vi.mocked(globalThis.getCookie).mockReturnValue(NONCE)
  })

  it('rejects anything but six digits before touching the database', async () => {
    withBody('12345')
    await expect(fn({})).rejects.toMatchObject({ name: 'ZodError' })
    withBody('12345a')
    await expect(fn({})).rejects.toMatchObject({ name: 'ZodError' })
    expect(dbCalls()).toHaveLength(0)
  })

  it('refuses a browser that never asked for a code', async () => {
    vi.mocked(globalThis.getCookie).mockReturnValue(undefined)
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'unknown' } })
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type: 'auth.redeem_unknown',
      userUid: undefined,
      meta: { via: 'code' },
      event: {},
    })
  })

  it('refuses a nonce without a row', async () => {
    queueDbResults([])
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'unknown' } })
  })

  it('refuses a row that was already redeemed', async () => {
    queueDbResults([tokenRow({ consumedAt: new Date() })])
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'used' } })
  })

  it.each([
    ['the link expired', { expiresAt: new Date(Date.now() - 1000) }],
    ['the code outlived its minutes', { requestedAt: new Date(Date.now() - 16 * 60_000) }],
  ])('refuses as expired when %s', async (_label, overrides) => {
    queueDbResults([tokenRow(overrides)])
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'expired' } })
  })

  it('locks once the member used up the daily budget', async () => {
    // MySQL hands SUM() back as a string.
    queueDbResults([tokenRow()], [{ attempts: '10' }])
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'locked' } })
    expect(dbCalls().some((call) => call.method === 'update')).toBe(false)
  })

  it('locks when the conditional claim finds no attempt left', async () => {
    queueDbResults([tokenRow({ codeAttempts: 5 })], [{ attempts: null }], [{ affectedRows: 0 }])
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'locked' } })
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth.redeem_locked', userUid: 'u1' }),
    )
  })

  it('treats an empty budget query as nothing spent', async () => {
    queueDbResults([tokenRow()], [], [{ affectedRows: 0 }])
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'locked' } })
  })

  it('refuses a wrong code and says how many guesses are left', async () => {
    withBody('654321')
    queueDbResults([tokenRow({ codeAttempts: 2 })], [{ attempts: '2' }], [{ affectedRows: 1 }])
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'wrong', attemptsLeft: 2 } })
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth.redeem_wrong', userUid: 'u1' }),
    )
    expect(globalThis.setUserSession).not.toHaveBeenCalled()
  })

  it('refuses a blocked account even with the right code', async () => {
    queueDbResults(
      [tokenRow()],
      [{ attempts: '0' }],
      [{ affectedRows: 1 }],
      [{ ...user, loginDisabled: true }],
    )
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'disabled' } })
  })

  it('refuses as used when the link from the same mail won the race', async () => {
    queueDbResults(
      [tokenRow()],
      [{ attempts: '0' }],
      [{ affectedRows: 1 }],
      [user],
      [{ affectedRows: 0 }],
    )
    await expect(fn({})).rejects.toMatchObject({ data: { reason: 'used' } })
    expect(globalThis.setUserSession).not.toHaveBeenCalled()
  })

  it('logs in, drops the binding and records the success', async () => {
    queueDbResults(
      [tokenRow()],
      [{ attempts: '0' }],
      [{ affectedRows: 1 }],
      [user],
      [{ affectedRows: 1 }],
      {}, // session insert
    )
    vi.mocked(globalThis.getUserSession).mockResolvedValue({ id: 'sess-1' })
    await expect(fn({})).resolves.toStrictEqual({})
    expect(globalThis.setUserSession).toHaveBeenCalledTimes(1)
    expect(globalThis.deleteCookie).toHaveBeenCalledTimes(1)
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type: 'auth.redeem_ok',
      userUid: 'u1',
      meta: { via: 'code' },
      event: {},
    })
  })
})
