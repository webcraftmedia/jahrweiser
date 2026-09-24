// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { IDLE_TTL_MS } from '../helpers/sessionTtl'

const mockLimit = vi.fn()
const mockSelectWhere = vi.fn(() => ({ limit: mockLimit }))
const mockFrom = vi.fn(() => ({ where: mockSelectWhere }))
const mockSelect = vi.fn(() => ({ from: mockFrom }))
const mockUpdateWhere = vi.fn()
const mockSet = vi.fn((_v: { expiresAt: Date; lastSeenAt: Date }) => ({ where: mockUpdateWhere }))
const mockUpdate = vi.fn(() => ({ set: mockSet }))

vi.mock('../db', () => ({ useDb: () => ({ select: mockSelect, update: mockUpdate }) }))

const mockRecordEvent = vi.fn()
vi.mock('../helpers/events', () => ({
  recordEvent: (...a: unknown[]) => mockRecordEvent(...a),
}))

const mockGetUserSession = vi.fn()
const mockClearUserSession = vi.fn()

// eslint-disable-next-line import/first
import handler from './session-check'

const run = handler as unknown as (event: unknown) => Promise<unknown>

const NOW = 1_700_000_000_000

describe('session-check middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateWhere.mockResolvedValue(undefined)
    vi.stubGlobal('getUserSession', mockGetUserSession)
    vi.stubGlobal('clearUserSession', mockClearUserSession)
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('ignores anonymous sessions (id but no user)', async () => {
    mockGetUserSession.mockResolvedValue({ id: 'sid' })
    await run({ path: '/' })
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('ignores sessions without an id', async () => {
    mockGetUserSession.mockResolvedValue({ user: { uid: 'u1' } })
    await run({ path: '/' })
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('does not slide when last seen within the throttle window', async () => {
    mockGetUserSession.mockResolvedValue({ id: 'sid', user: { uid: 'u1' } })
    mockLimit.mockResolvedValue([
      {
        revokedAt: null,
        expiresAt: new Date(NOW + IDLE_TTL_MS),
        createdAt: new Date(NOW - 1000),
        lastSeenAt: new Date(NOW - 1000), // 1s ago, within 60s throttle
      },
    ])
    await run({ path: '/api/calendars' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('slides expiresAt forward on activity past the throttle', async () => {
    const createdAt = NOW - 2 * 24 * 60 * 60 * 1000 // 2 days old, far from the cap
    mockGetUserSession.mockResolvedValue({ id: 'sid', user: { uid: 'u1' } })
    mockLimit.mockResolvedValue([
      {
        revokedAt: null,
        expiresAt: new Date(NOW + 1000),
        createdAt: new Date(createdAt),
        lastSeenAt: new Date(NOW - 5 * 60_000), // 5 min ago, past throttle
      },
    ])
    await run({ path: '/api/calendars' })
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const payload = mockSet.mock.calls[0]![0]
    expect(payload.expiresAt.getTime()).toBe(NOW + IDLE_TTL_MS)
    expect(payload.lastSeenAt.getTime()).toBe(NOW)
  })

  it('rejects an expired session with 401 on API paths', async () => {
    mockGetUserSession.mockResolvedValue({ id: 'sid', user: { uid: 'u1' } })
    mockLimit.mockResolvedValue([
      {
        revokedAt: null,
        expiresAt: new Date(NOW - 1000),
        createdAt: new Date(NOW - 1000),
        lastSeenAt: null,
      },
    ])
    await expect(run({ path: '/api/calendars' })).rejects.toMatchObject({ statusCode: 401 })
    expect(mockClearUserSession).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  // Recorded before the cookie is cleared: afterwards the browser stops sending
  // it, so this is the only request that can say why somebody was logged out.
  it.each([
    ['revoked', { revokedAt: new Date(NOW - 1000), expiresAt: new Date(NOW + IDLE_TTL_MS) }],
    ['expired', { revokedAt: null, expiresAt: new Date(NOW - 1000) }],
  ])('records why a session stopped counting: %s', async (reason, row) => {
    mockGetUserSession.mockResolvedValue({ id: 'sid', user: { uid: 'u1' } })
    mockLimit.mockResolvedValue([{ ...row, createdAt: new Date(NOW - 1000), lastSeenAt: null }])

    await expect(run({ path: '/api/calendars' })).rejects.toMatchObject({ statusCode: 401 })

    expect(mockRecordEvent).toHaveBeenCalledWith({
      type: 'session.invalidated',
      userUid: 'u1',
      meta: { reason },
      event: { path: '/api/calendars' },
    })
  })

  it('tells a vanished session row apart from an expired one', async () => {
    // What a restored backup looks like from here — and a member being logged
    // out for a reason nobody would otherwise be able to name.
    mockGetUserSession.mockResolvedValue({ id: 'sid', user: { uid: 'u1' } })
    mockLimit.mockResolvedValue([])

    await expect(run({ path: '/api/calendars' })).rejects.toMatchObject({ statusCode: 401 })

    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { reason: 'missing' } }),
    )
  })

  it('records nothing while a session is simply in use', async () => {
    mockGetUserSession.mockResolvedValue({ id: 'sid', user: { uid: 'u1' } })
    mockLimit.mockResolvedValue([
      {
        revokedAt: null,
        expiresAt: new Date(NOW + IDLE_TTL_MS),
        createdAt: new Date(NOW - 1000),
        lastSeenAt: new Date(NOW - 1000),
      },
    ])
    await run({ path: '/api/calendars' })
    expect(mockRecordEvent).not.toHaveBeenCalled()
  })

  it('clears a revoked session without throwing on page paths', async () => {
    mockGetUserSession.mockResolvedValue({ id: 'sid', user: { uid: 'u1' } })
    mockLimit.mockResolvedValue([
      {
        revokedAt: new Date(NOW - 1000),
        expiresAt: new Date(NOW + IDLE_TTL_MS),
        createdAt: new Date(NOW - 1000),
        lastSeenAt: null,
      },
    ])
    await expect(run({ path: '/' })).resolves.toBeUndefined()
    expect(mockClearUserSession).toHaveBeenCalledTimes(1)
  })
})
