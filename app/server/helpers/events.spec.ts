// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { dbCalls, firstDbCall, mockDb, queueDbResults, resetDb } from '../../test/helpers/mock-db'

import {
  EVENT_RETENTION_DAYS,
  IP_RETENTION_DAYS,
  pruneUserEvents,
  recordEvent,
  retentionCutoffs,
  truncateIp,
} from './events'

// Swappable so one test can hand the helper a database that refuses to write —
// the branch that decides whether a failed audit write stops a login.
const { dbImpl } = vi.hoisted((): { dbImpl: { current: unknown } } => ({
  dbImpl: { current: null },
}))
vi.mock('../db', () => ({ useDb: () => dbImpl.current ?? mockDb }))

/**
 * Every Date reachable from a recorded builder argument. Drizzle wraps bound
 * values in its own structures (and those are circular), so the cut-off a
 * statement really carries is only visible by walking to it.
 */
function datesIn(value: unknown, seen = new WeakSet<object>()): Date[] {
  if (value instanceof Date) return [value]
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  return Object.values(value).flatMap((child) => datesIn(child, seen))
}

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0)
const DAY_MS = 24 * 60 * 60 * 1000

describe('truncateIp', () => {
  it.each([
    ['192.0.2.44', '192.0.2.0'],
    ['10.1.2.3', '10.1.2.0'],
    ['255.255.255.255', '255.255.255.0'],
    // Leaves the network we actually saw, rather than padding to three groups.
    ['2001:db8:85a3:8d3:1319:8a2e:370:7348', '2001:db8:85a3::'],
    ['2001:db8::1', '2001:db8::'],
    ['fe80::1', 'fe80::'],
    ['::1', '::'],
    // An IPv4 address wearing an IPv6 hat — what a dual-stack Node sees.
    ['::ffff:192.0.2.44', '192.0.2.0'],
    ['  192.0.2.44  ', '192.0.2.0'],
  ])('narrows %s to %s', (input, expected) => {
    expect(truncateIp(input)).toBe(expected)
  })

  it.each([
    [undefined],
    [null],
    [''],
    ['   '],
    // Half-read addresses become nothing: a wrong network in an audit trail
    // invites conclusions it cannot support.
    ['192.0.2'],
    ['192.0.2.1.5'],
    ['999.0.2.1'],
    ['not-an-address'],
  ])('refuses %s', (input) => {
    expect(truncateIp(input)).toBeNull()
  })
})

describe('recordEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it('writes the event with its subject and context', async () => {
    await recordEvent({
      type: 'auth.redeem_used',
      userUid: 'u1',
      meta: { reason: 'used' },
    })
    expect(firstDbCall('values')).toStrictEqual([
      {
        at: new Date(NOW),
        type: 'auth.redeem_used',
        userUid: 'u1',
        actorUid: null,
        meta: { reason: 'used' },
        ipPrefix: null,
      },
    ])
  })

  it('records who acted when it was an admin', async () => {
    await recordEvent({ type: 'admin.tags_changed', userUid: 'u1', actorUid: 'a1' })
    expect(firstDbCall('values')?.[0]).toMatchObject({ userUid: 'u1', actorUid: 'a1' })
  })

  it('leaves the subject empty for an attempt it cannot attribute', async () => {
    // Deliberately no address either — see the comment on `user_uid`.
    await recordEvent({ type: 'auth.link_unknown' })
    expect(firstDbCall('values')?.[0]).toMatchObject({ userUid: null, meta: null })
  })

  it('stores only the network an event came from', async () => {
    vi.mocked(globalThis.getRequestIP).mockReturnValue('192.0.2.44')
    await recordEvent({ type: 'auth.link_requested', userUid: 'u1', event: {} as never })
    expect(vi.mocked(globalThis.getRequestIP)).toHaveBeenCalledWith({}, { xForwardedFor: true })
    expect(firstDbCall('values')?.[0]).toMatchObject({ ipPrefix: '192.0.2.0' })
  })

  it('stores no origin when the request has none to give', async () => {
    vi.mocked(globalThis.getRequestIP).mockReturnValue(undefined)
    await recordEvent({ type: 'auth.link_requested', userUid: 'u1', event: {} as never })
    expect(firstDbCall('values')?.[0]).toMatchObject({ ipPrefix: null })
  })

  it('fails open and loudly when the trail cannot be written', async () => {
    // A member must never be unable to log in because the audit table was
    // busy — but a silent hole in the log is worse than a noisy one.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error('ER_LOCK_WAIT_TIMEOUT')
    dbImpl.current = { insert: () => ({ values: () => Promise.reject(boom) }) }

    await expect(recordEvent({ type: 'auth.redeem_ok', userUid: 'u1' })).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith('[events] failed to record auth.redeem_ok:', boom)

    dbImpl.current = null
    consoleSpy.mockRestore()
  })
})

describe('pruneUserEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDb()
  })

  it('blanks the origin long before it drops the event', async () => {
    // Two horizons on purpose: the origin is the sharpest thing in the table
    // and goes first, while "a link was sent in March" stays answerable.
    queueDbResults([{ affectedRows: 7 }], [{ affectedRows: 3 }])

    const result = await pruneUserEvents(NOW)

    expect(result).toStrictEqual({ anonymised: 7, deleted: 3 })
    expect(firstDbCall('set')).toStrictEqual([{ ipPrefix: null }])
    expect(IP_RETENTION_DAYS).toBeLessThan(EVENT_RETENTION_DAYS)
  })

  it('gives each sweep its own cut-off, in the right order', async () => {
    // The mistake with teeth: hand the delete the IP horizon and half a year of
    // trail is gone after a month. So both statements are checked against the
    // date they actually carry.
    queueDbResults([{ affectedRows: 0 }], [{ affectedRows: 0 }])
    await pruneUserEvents(NOW)

    const wheres = dbCalls().filter((call) => call.method === 'where')
    expect(wheres).toHaveLength(2)
    expect(datesIn(wheres[0]!.args)).toStrictEqual([new Date(NOW - IP_RETENTION_DAYS * DAY_MS)])
    expect(datesIn(wheres[1]!.args)).toStrictEqual([new Date(NOW - EVENT_RETENTION_DAYS * DAY_MS)])
  })

  it('measures both horizons from the same moment', () => {
    const { anonymiseBefore, deleteBefore } = retentionCutoffs(NOW)
    expect(anonymiseBefore).toStrictEqual(new Date(NOW - IP_RETENTION_DAYS * DAY_MS))
    expect(deleteBefore).toStrictEqual(new Date(NOW - EVENT_RETENTION_DAYS * DAY_MS))
  })
})
