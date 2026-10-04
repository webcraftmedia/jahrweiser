// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { firstDbCall, mockDb, queueDbResults, resetDb } from '../../test/helpers/mock-db'

import { codeHashOf, codeKeyOf } from './loginCode'
import { sendLoginLink } from './loginLink'

const mockSend = vi.fn()
vi.mock('../db', () => ({ useDb: () => mockDb }))
vi.mock('./email', () => ({
  emailRenderer: { send: (...a: unknown[]) => mockSend(...a) },
  defaultParams: {},
}))

const mockRecordEvent = vi.fn()
vi.mock('./events', () => ({ recordEvent: (...a: unknown[]) => mockRecordEvent(...a) }))

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

  it('adds no code without a binding, as for registration', async () => {
    queueDbResults({})
    mockSend.mockResolvedValue(undefined)
    await sendLoginLink(config, user)
    expect(mockSend.mock.calls[0]![0].locals.code).toBeUndefined()
    expect(firstDbCall('values')![0]).not.toHaveProperty('codeHash')
  })

  it('adds a code bound to the nonce and stores only its hashes', async () => {
    queueDbResults({})
    mockSend.mockResolvedValue(undefined)
    await sendLoginLink(config, user, undefined, 'nonce')

    const locals = mockSend.mock.calls[0]![0].locals
    expect(locals.code).toMatch(/^\d{3} \d{3}$/)
    expect(locals.codeMinutes).toBe(15)
    const code = (locals.code as string).replace(' ', '')
    expect(firstDbCall('values')![0]).toMatchObject({
      codeKey: codeKeyOf('nonce'),
      codeHash: codeHashOf('nonce', code),
    })
    expect(JSON.stringify(firstDbCall('values'))).not.toContain(code)
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

  it('records the send', async () => {
    queueDbResults({})
    mockSend.mockResolvedValue(undefined)
    await sendLoginLink(config, user)
    expect(mockRecordEvent).toHaveBeenCalledWith({ type: 'auth.mail_sent', userUid: 'u1' })
  })

  it('records a send that needed the retry as such', async () => {
    // A member whose links regularly need a second attempt has an SMTP
    // problem — which looks nothing like the browser problem they will report.
    queueDbResults({})
    mockSend.mockRejectedValueOnce(new Error('pool drop')).mockResolvedValueOnce(undefined)
    await sendLoginLink(config, user)
    expect(mockRecordEvent).toHaveBeenCalledWith({
      type: 'auth.mail_sent',
      userUid: 'u1',
      meta: { retried: true },
    })
  })

  it('records a mail that never went out', async () => {
    // The gap this closes: the member waits for a mail, and nothing anywhere
    // said it was never sent.
    queueDbResults({})
    mockSend.mockRejectedValue(new Error('smtp down'))
    await expect(sendLoginLink(config, user)).rejects.toThrow('Failed to send login email')
    expect(mockRecordEvent).toHaveBeenCalledWith({ type: 'auth.mail_failed', userUid: 'u1' })
  })
})
