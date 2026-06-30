// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { mockDb, queueDbResults, resetDb } from '../../test/helpers/mock-db'

import { sendLoginLink } from './loginLink'

const mockSend = vi.fn()
vi.mock('../db', () => ({ useDb: () => mockDb }))
vi.mock('./email', () => ({
  emailRenderer: { send: (...a: unknown[]) => mockSend(...a) },
  defaultParams: {},
}))

const config = { CLIENT_URI: 'http://localhost:3000' }
const user = { uid: 'u1', email: 'a@example.com', displayName: 'Anna Mustermann' }

describe('sendLoginLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
  })

  it('persists a token and sends the magic link', async () => {
    queueDbResults({})
    mockSend.mockResolvedValue(undefined)
    await sendLoginLink(config, user)
    expect(mockSend).toHaveBeenCalledTimes(1)
    const authURL = mockSend.mock.calls[0]![0].locals.authURL as URL
    expect(authURL.pathname).toMatch(/^\/login\//)
    expect(authURL.searchParams.has('redirect')).toBe(false)
  })

  it('appends the redirect when given', async () => {
    queueDbResults({})
    mockSend.mockResolvedValue(undefined)
    await sendLoginLink(config, user, '/2026/01')
    const authURL = mockSend.mock.calls[0]![0].locals.authURL as URL
    expect(authURL.searchParams.get('redirect')).toBe('/2026/01')
  })

  it('handles a user without a display name', async () => {
    queueDbResults({})
    mockSend.mockResolvedValue(undefined)
    await sendLoginLink(config, { uid: 'u2', email: 'b@example.com', displayName: null })
    expect(mockSend.mock.calls[0]![0].message.to.name).toBe('')
  })

  it('retries once when the first send fails', async () => {
    queueDbResults({})
    mockSend.mockRejectedValueOnce(new Error('pool drop')).mockResolvedValueOnce(undefined)
    await sendLoginLink(config, user)
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('throws after a second failure', async () => {
    queueDbResults({})
    mockSend.mockRejectedValue(new Error('smtp down'))
    await expect(sendLoginLink(config, user)).rejects.toThrow('Failed to send login email')
    expect(mockSend).toHaveBeenCalledTimes(2)
  })
})
