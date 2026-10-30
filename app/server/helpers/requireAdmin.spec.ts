// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { nitro } from '../../test/setup-server'

import { requireAdmin } from './requireAdmin'

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the acting admin', async () => {
    vi.mocked(nitro.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', email: 'admin@example.de', name: 'Admin Example', role: 'admin' },
    })
    await expect(requireAdmin({})).resolves.toStrictEqual({
      uid: 'a1',
      email: 'admin@example.de',
      name: 'Admin Example',
      role: 'admin',
    })
  })

  it('refuses a signed-in member who is not an admin', async () => {
    // 403 rather than 404: they are a legitimate member asking for something
    // that is not theirs, and a 404 would only send them looking.
    vi.mocked(nitro.requireUserSession).mockResolvedValue({
      user: { uid: 'u1', email: 'anna@example.de', name: 'Anna', role: 'user' },
    })
    await expect(requireAdmin({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a session without a role at all', async () => {
    vi.mocked(nitro.requireUserSession).mockResolvedValue({ user: {} })
    await expect(requireAdmin({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses an admin session with no id to hold to account', async () => {
    // Every admin action is written down against whoever took it; a session
    // that cannot be attributed must not be able to take one.
    vi.mocked(nitro.requireUserSession).mockResolvedValue({
      user: { email: 'admin@example.de', role: 'admin' },
    })
    await expect(requireAdmin({})).rejects.toMatchObject({ statusCode: 401 })
  })

  it('tolerates an admin without a display name or address', async () => {
    vi.mocked(nitro.requireUserSession).mockResolvedValue({
      user: { uid: 'a1', role: 'admin' },
    })
    await expect(requireAdmin({})).resolves.toMatchObject({ email: '', name: null })
  })
})
