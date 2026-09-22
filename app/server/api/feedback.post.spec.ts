// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ZodError } from 'zod'

import handler from './feedback.post'

const mockSend = vi.hoisted(() => vi.fn())
vi.mock('../helpers/email', () => ({
  emailRenderer: { send: (...a: unknown[]) => mockSend(...a) },
  defaultParams: { APPLICATION_NAME: 'Jahrweiser', SUPPORT_EMAIL: 'hilfe@example.com' },
}))

const fn = handler as unknown as (e: unknown) => Promise<{ sent: boolean }>

const originalConfig = globalThis.useRuntimeConfig

const CONTEXT = {
  page: '/2026/09',
  appVersion: '1.14.4',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
  viewport: '1280×800',
  colorScheme: 'hell',
}

/** What the browser posts for a bug report, with whatever a test changes. */
function body(overrides: Record<string, unknown> = {}) {
  return { kind: 'bug', message: 'Die Karte lädt nicht.', context: CONTEXT, ...overrides }
}

/** What it posts for plain feedback — no technical context at all. */
function feedbackBody(overrides: Record<string, unknown> = {}) {
  return { kind: 'feedback', message: 'Schöne Sache.', ...overrides }
}

/** Make `readValidatedBody` hand the handler this payload. */
function posting(payload: unknown) {
  vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_e, v) =>
    (v as (d: unknown) => unknown)(payload),
  )
}

/**
 * Sign the request in as `uid`. The cooldown lives in a module-level map, so
 * every test that must start outside it uses an id of its own rather than
 * reaching into the module.
 */
function signedInAs(uid: string, user: Record<string, unknown> = {}) {
  vi.mocked(globalThis.requireUserSession).mockResolvedValue({
    user: { uid, name: 'Anna Mustermann', email: 'anna@example.com', role: 'user', ...user },
  })
}

/** The locals the endpoint handed to the template on its last send. */
function lastLocals(): Record<string, unknown> {
  return mockSend.mock.calls.at(-1)![0].locals as Record<string, unknown>
}

describe('feedback.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue(undefined)
    signedInAs('u-default')
    posting(body())
  })

  afterEach(() => {
    globalThis.useRuntimeConfig = originalConfig
  })

  it('sends the report to the configured address', async () => {
    signedInAs('u-send')
    await expect(fn({})).resolves.toStrictEqual({ sent: true })
    const args = mockSend.mock.calls[0]![0]
    expect(args.message.to.address).toBe('feedback@example.com')
    // Answering has to reach the member, while From stays the application's
    // own sender so the mail passes SPF/DKIM.
    expect(args.message.replyTo).toStrictEqual({
      address: 'anna@example.com',
      name: 'Anna Mustermann',
    })
    expect(args.template).toMatch(/server\/emails\/feedback$/)
  })

  it('passes a bug report with every context value into the mail', async () => {
    signedInAs('u-locals')
    await fn({})
    expect(lastLocals()).toMatchObject({
      message: 'Die Karte lädt nicht.',
      senderName: 'Anna Mustermann',
      senderEmail: 'anna@example.com',
      senderUid: 'u-locals',
      senderRole: 'user',
      isBug: true,
      ...CONTEXT,
    })
  })

  it('sends plain feedback without any technical context', async () => {
    // The point of the split: an idea is not reproduced, so nothing about the
    // browser is collected for it.
    signedInAs('u-plain')
    posting(feedbackBody())
    await fn({})
    const locals = lastLocals()
    expect(locals).toMatchObject({ message: 'Schöne Sache.', isBug: false })
    for (const key of ['page', 'appVersion', 'userAgent', 'viewport', 'colorScheme']) {
      expect(locals).not.toHaveProperty(key)
    }
  })

  it('drops a context that was posted with plain feedback anyway', async () => {
    // zod strips what the union's feedback branch does not declare, so a client
    // that sends one regardless cannot get it into the mail.
    signedInAs('u-sneaky')
    posting(feedbackBody({ context: CONTEXT }))
    await fn({})
    expect(lastLocals()).not.toHaveProperty('userAgent')
  })

  it('suppresses the support block — the mail goes to the team itself', async () => {
    signedInAs('u-support')
    await fn({})
    expect(lastLocals()).toMatchObject({ SUPPORT_EMAIL: '', name: '', alwaysSalutation: true })
  })

  it('strips line breaks from the name that ends up in the subject', async () => {
    // A display name is DAV-sourced and could carry anything; a newline in it
    // is how a header gets forged.
    signedInAs('u-inject', { name: 'Anna\r\nBcc: someone@evil.example' })
    await fn({})
    expect(lastLocals().senderName).toBe('Anna Bcc: someone@evil.example')
  })

  it('tolerates a session without a display name or role', async () => {
    signedInAs('u-nameless', { name: undefined, role: undefined })
    await fn({})
    expect(lastLocals()).toMatchObject({ senderName: '', senderRole: '' })
  })

  it('rejects a session without a uid', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { email: 'anna@example.com' },
    })
    await expect(fn({})).rejects.toThrow('No user context')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('rejects a session without an address to reply to', async () => {
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({ user: { uid: 'u-noemail' } })
    await expect(fn({})).rejects.toThrow('No user context')
  })

  it('refuses when no feedback address is configured', async () => {
    globalThis.useRuntimeConfig = () => ({
      FEEDBACK_EMAIL: '',
      FEEDBACK_RATE_LIMIT_MS: 60000,
    })
    await expect(fn({})).rejects.toThrow('Feedback is not configured')
    expect(mockSend).not.toHaveBeenCalled()
  })

  describe('validation', () => {
    const validate = async (payload: unknown) => {
      posting(payload)
      return fn({})
    }

    it('rejects an unknown kind', async () => {
      await expect(validate(body({ kind: 'rant' }))).rejects.toThrow(ZodError)
    })

    it('rejects an empty message', async () => {
      await expect(validate(body({ message: '   ' }))).rejects.toThrow(ZodError)
    })

    it('rejects a message past the limit the form enforces', async () => {
      await expect(validate(body({ message: 'x'.repeat(5001) }))).rejects.toThrow(ZodError)
    })

    it('rejects an over-long context value', async () => {
      await expect(
        validate(body({ context: { ...CONTEXT, userAgent: 'x'.repeat(301) } })),
      ).rejects.toThrow(ZodError)
    })

    it('rejects a bug report without context', async () => {
      await expect(validate(body({ context: undefined }))).rejects.toThrow(ZodError)
    })
  })

  describe('cooldown', () => {
    it('turns a second report within the window away', async () => {
      signedInAs('u-cooldown')
      await fn({})
      await expect(fn({})).rejects.toThrow('Please wait before sending again')
      expect(mockSend).toHaveBeenCalledTimes(1)
    })

    it('lets the member through again once the window has passed', async () => {
      vi.useFakeTimers()
      try {
        signedInAs('u-window')
        await fn({})
        vi.advanceTimersByTime(60_001)
        await expect(fn({})).resolves.toStrictEqual({ sent: true })
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not hold a member hostage for a send that failed', async () => {
      signedInAs('u-failed')
      mockSend.mockRejectedValue(new Error('smtp down'))
      await expect(fn({})).rejects.toThrow('Failed to send feedback email')
      mockSend.mockResolvedValue(undefined)
      await expect(fn({})).resolves.toStrictEqual({ sent: true })
    })

    it('is off when the limit is configured to zero', async () => {
      globalThis.useRuntimeConfig = () => ({
        FEEDBACK_EMAIL: 'feedback@example.com',
        FEEDBACK_RATE_LIMIT_MS: 0,
        APP_TIMEZONE: 'Europe/Berlin',
      })
      signedInAs('u-nolimit')
      await fn({})
      await expect(fn({})).resolves.toStrictEqual({ sent: true })
    })

    it('is per member, not global', async () => {
      signedInAs('u-first')
      await fn({})
      signedInAs('u-second')
      await expect(fn({})).resolves.toStrictEqual({ sent: true })
    })
  })

  describe('delivery failures', () => {
    it('retries once when the first send fails', async () => {
      signedInAs('u-retry')
      mockSend.mockRejectedValueOnce(new Error('pool drop')).mockResolvedValueOnce(undefined)
      await expect(fn({})).resolves.toStrictEqual({ sent: true })
      expect(mockSend).toHaveBeenCalledTimes(2)
    })

    it('gives up after the second failure', async () => {
      signedInAs('u-giveup')
      mockSend.mockRejectedValue(new Error('smtp down'))
      await expect(fn({})).rejects.toThrow('Failed to send feedback email')
      expect(mockSend).toHaveBeenCalledTimes(2)
    })
  })
})
