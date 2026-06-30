// @vitest-environment node
import '../../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createMockVCard } from '../../../test/fixtures/vcard-data'

import handler from './profile.get'

const mockFindUserByEmail = vi.fn()
vi.mock('../../helpers/dav', () => ({
  createCardDAVAccount: vi.fn().mockReturnValue({ accountType: 'carddav' }),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
}))

const fn = handler as unknown as (e: unknown) => Promise<{ firstName: string; lastName: string }>

describe('profile.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: 'Anna Mustermann', email: 'anna@example.com', role: 'user' },
    })
  })

  it('reads the name from the DAV vcard', async () => {
    mockFindUserByEmail.mockResolvedValue({
      user: {},
      vcard: createMockVCard({ fn: 'Anna Mustermann' }),
    })
    await expect(fn({})).resolves.toStrictEqual({ firstName: 'Anna', lastName: 'Mustermann' })
  })

  it('falls back to splitting the session name when not in DAV', async () => {
    mockFindUserByEmail.mockResolvedValue(false)
    await expect(fn({})).resolves.toStrictEqual({ firstName: 'Anna', lastName: 'Mustermann' })
  })

  it('handles a session without a name', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', name: null, email: 'x@x.de', role: 'user' },
    })
    mockFindUserByEmail.mockResolvedValue(false)
    await expect(fn({})).resolves.toStrictEqual({ firstName: '', lastName: '' })
  })
})
