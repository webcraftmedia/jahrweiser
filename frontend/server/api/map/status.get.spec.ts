// @vitest-environment node
import '../../../test/setup-server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../../test/helpers/mock-db'

import handler from './status.get'

vi.mock('../../db', () => ({ useDb: () => mockDb }))

const fn = handler as unknown as (e: unknown) => Promise<{ hasPostalCode: boolean }>

describe('map/status.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
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
    ['a postal code is on file', '64673', true],
    ['the column is empty', '', false],
    ['the column is null', null, false],
    ['it holds nothing but spaces', '   ', false],
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
})
