// @vitest-environment node
import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../test/helpers/mock-db'

import { unsubscribeByToken } from './unsubscribe'
import getHandler from './unsubscribe.get'
import postHandler from './unsubscribe.post'

vi.mock('../../db', () => ({ useDb: () => mockDb }))

const getFn = getHandler as unknown as (event: unknown) => Promise<string>
const postFn = postHandler as unknown as (event: unknown) => Promise<unknown>

describe('unsubscribeByToken', () => {
  beforeEach(resetDb)

  it('returns false for an empty token without touching the DB', async () => {
    await expect(unsubscribeByToken('')).resolves.toBe(false)
  })

  it('returns false for a non-string token', async () => {
    await expect(unsubscribeByToken(undefined as unknown as string)).resolves.toBe(false)
  })

  it('unsubscribes and returns true when the token matches a user', async () => {
    queueDbResults([{ uid: 'u1' }], {})
    await expect(unsubscribeByToken('tok')).resolves.toBe(true)
  })

  it('returns false when no user has the token', async () => {
    queueDbResults([])
    await expect(unsubscribeByToken('unknown')).resolves.toBe(false)
  })
})

describe('unsubscribe.get', () => {
  beforeEach(resetDb)

  it('renders the success page when the token is valid', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({ token: 'tok' })
    queueDbResults([{ uid: 'u1' }], {})
    const html = await getFn({})
    expect(html).toContain('Newsletter abbestellt')
  })

  it('renders the 404 page when the token is missing/invalid', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({})
    const html = await getFn({})
    expect(html).toContain('Token ungültig')
  })
})

describe('unsubscribe.post', () => {
  beforeEach(resetDb)

  it('returns an empty 200 when the token is valid', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({ token: 'tok' })
    queueDbResults([{ uid: 'u1' }], {})
    await expect(postFn({})).resolves.toStrictEqual({})
  })

  it('throws 404 when the token is missing/invalid', async () => {
    vi.mocked(globalThis.getQuery).mockReturnValue({})
    await expect(postFn({})).rejects.toThrow('Token invalid')
  })
})
