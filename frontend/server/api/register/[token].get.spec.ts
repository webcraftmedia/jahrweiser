// @vitest-environment node
import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../test/helpers/mock-db'

import handler from './[token].get'

vi.mock('~~/server/db', () => ({ useDb: () => mockDb }))

const fn = handler as unknown as (
  e: unknown,
) => Promise<{ status: string; invitedBy: string | null }>

describe('register/[token].get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
  })

  it('returns notfound when no token is given', async () => {
    vi.mocked(globalThis.getRouterParam).mockReturnValue(undefined)
    await expect(fn({})).resolves.toStrictEqual({ status: 'notfound', invitedBy: null })
  })

  it('returns notfound when the link does not exist', async () => {
    vi.mocked(globalThis.getRouterParam).mockReturnValue('tok')
    queueDbResults([])
    await expect(fn({})).resolves.toStrictEqual({ status: 'notfound', invitedBy: null })
  })

  it('returns the status and inviter for a valid link', async () => {
    vi.mocked(globalThis.getRouterParam).mockReturnValue('tok')
    queueDbResults(
      [{ link: { revokedAt: null, expiresAt: null, maxUses: null }, invitedBy: 'Admin Adam' }],
      [{ count: '0' }],
    )
    await expect(fn({})).resolves.toStrictEqual({ status: 'valid', invitedBy: 'Admin Adam' })
  })

  it('treats a missing count row as zero uses', async () => {
    vi.mocked(globalThis.getRouterParam).mockReturnValue('tok')
    queueDbResults(
      [{ link: { revokedAt: null, expiresAt: null, maxUses: 1 }, invitedBy: null }],
      [], // count query returns no row
    )
    await expect(fn({})).resolves.toStrictEqual({ status: 'valid', invitedBy: null })
  })
})
