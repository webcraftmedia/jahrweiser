// @vitest-environment node
import '../../test/setup-server'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { dbCalls, firstDbCall, mockDb, queueDbResults, resetDb } from '../../test/helpers/mock-db'

import { codeHashOf, codeKeyOf } from './loginCode'
import { pruneLoginTokens, sendLoginLink } from './loginLink'
import { sha256 } from './sha256'

import type { SQL } from 'drizzle-orm'

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

  it('stores only the hash of the token it mails', async () => {
    // Reading the table must not be enough to log in as somebody with an open
    // link, so the mailed token and the stored value have to differ.
    queueDbResults({})
    mockSend.mockResolvedValue(undefined)
    await sendLoginLink(config, user)
    const { tokenHash } = firstDbCall('values')![0] as { tokenHash: string }
    const url = mockSend.mock.calls[0]![0].locals.authURL as URL
    const mailed = url.pathname.replace('/login/', '')
    expect(mailed).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenHash).toBe(sha256(mailed))
    expect(tokenHash).not.toBe(mailed)
  })

  it('drops the token of a mail that never went out', async () => {
    // A live credential nobody received, which would also keep the durable
    // cooldown in requestLoginLink running for a mail that does not exist.
    queueDbResults({}, {})
    mockSend.mockRejectedValue(new Error('smtp down'))
    await expect(sendLoginLink(config, user)).rejects.toThrow('Failed to send login email')
    const methods = dbCalls().map((call) => call.method)
    expect(methods.indexOf('delete')).toBeGreaterThan(methods.indexOf('insert'))
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

describe('pruneLoginTokens', () => {
  beforeEach(() => {
    resetDb()
  })

  it('deletes rows past the retention and reports how many', async () => {
    queueDbResults([{ affectedRows: 3 }])
    const now = Date.UTC(2026, 9, 30)
    await expect(pruneLoginTokens(now)).resolves.toBe(3)
    const where = firstDbCall('where')![0] as SQL
    expect(new MySqlDialect().sqlToQuery(where).params).toStrictEqual(['2026-09-30 00:00:00.000'])
  })
})
