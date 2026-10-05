import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  isNetworkError,
  mergeEvents,
  nextMonthRange,
  readCalendarEvents,
  readCalendars,
  readEvent,
  useOfflineStand,
} from './offlineCalendar'
import { enableOfflineSession } from './offlineSession'

const store = vi.hoisted(() => ({
  saveEntry: vi.fn(),
  loadEntry: vi.fn(),
  loadOverlapping: vi.fn(),
}))
vi.mock('./offlineData', () => store)

const session = vi.hoisted(() => ({ enabled: false, valid: true }))
vi.mock('./offlineSession', () => ({
  enableOfflineSession: () => {
    session.enabled = true
  },
  offlineSessionEnabled: () => session.enabled,
  offlineSessionValid: () => session.valid,
}))

/** What ofetch throws when the request never reached the server. */
function offline() {
  return Object.assign(new Error('fetch failed'), { name: 'FetchError', response: undefined })
}
function refused(status: number) {
  return Object.assign(new Error(String(status)), { name: 'FetchError', response: { status } })
}

const event = (id: string, startDate: string, endDate = startDate, occurrence?: number) => ({
  id,
  startDate,
  endDate,
  ...(occurrence === undefined ? {} : { occurrence }),
})

/** Lets the not-awaited store write run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('offlineCalendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.enabled = false
    session.valid = true
    useOfflineStand().value = null
    store.saveEntry.mockResolvedValue(undefined)
  })

  describe('outside the installed app', () => {
    it('hands back the very promise of the request and stores nothing', async () => {
      const request = Promise.resolve(['A'])
      expect(readCalendars('u1', () => request)).toBe(request)
      await settle()
      expect(store.saveEntry).not.toHaveBeenCalled()
    })

    it('does the same in the installed app before anybody is signed in', () => {
      enableOfflineSession()
      const request = Promise.resolve({})
      expect(readEvent(undefined, 'Work', 'e1', undefined, () => request)).toBe(request)
    })
  })

  describe('in the installed app', () => {
    beforeEach(() => {
      enableOfflineSession()
    })

    it('stores what the server answered, under the member', async () => {
      useOfflineStand().value = 5
      await expect(readCalendars('u1', async () => ['A'])).resolves.toStrictEqual(['A'])
      await settle()
      expect(store.saveEntry).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'calendars', uid: 'u1', data: ['A'] }),
      )
      // Fresh from the server again: no "Stand" line.
      expect(useOfflineStand().value).toBeNull()
    })

    it('shows the calendar even when it cannot be stored', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      store.saveEntry.mockRejectedValue(new Error('QuotaExceededError'))
      await expect(readCalendars('u1', async () => ['A'])).resolves.toStrictEqual(['A'])
      await settle()
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })

    it('falls back to the stored copy offline and says from when', async () => {
      store.loadEntry.mockResolvedValue({ savedAt: 42, data: ['A'] })
      await expect(
        readCalendars('u1', async () => {
          throw offline()
        }),
      ).resolves.toStrictEqual(['A'])
      expect(store.loadEntry).toHaveBeenCalledWith('calendars', 'u1')
      expect(useOfflineStand().value).toBe(42)
    })

    it('stores an opened event under its calendar, id and occurrence', async () => {
      await readEvent('u1', 'Work', 'e1', undefined, async () => ({ summary: 'S' }))
      await settle()
      expect(store.saveEntry).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'event:Work:e1:', uid: 'u1', data: { summary: 'S' } }),
      )
    })

    it('reports the oldest of several stored answers', async () => {
      useOfflineStand().value = 10
      store.loadEntry.mockResolvedValue({ savedAt: 42, data: {} })
      await readEvent('u1', 'Work', 'e1', 2, async () => {
        throw offline()
      })
      expect(store.loadEntry).toHaveBeenCalledWith('event:Work:e1:2', 'u1')
      expect(useOfflineStand().value).toBe(10)
    })

    it('passes a refusal from the server on — a 401 must still log out', async () => {
      store.loadEntry.mockResolvedValue({ savedAt: 1, data: ['A'] })
      await expect(
        readCalendars('u1', async () => {
          throw refused(401)
        }),
      ).rejects.toThrow('401')
      expect(store.loadEntry).not.toHaveBeenCalled()
    })

    it('shows nothing stored once the session would have run out', async () => {
      session.valid = false
      await expect(
        readEvent('u1', 'Work', 'e1', undefined, async () => {
          throw offline()
        }),
      ).rejects.toThrow('fetch failed')
      expect(store.loadEntry).not.toHaveBeenCalled()
    })

    it('fails as before when nothing is stored', async () => {
      store.loadEntry.mockResolvedValue(null)
      await expect(
        readEvent('u1', 'Work', 'e1', undefined, async () => {
          throw offline()
        }),
      ).rejects.toThrow('fetch failed')
    })

    it('stores an event list with the calendar and span it covers', async () => {
      const start = new Date(1000)
      const end = new Date(2000)
      await readCalendarEvents('u1', 'Work', start, end, async () => [event('e1', '1970-01-01')])
      await settle()
      expect(store.saveEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'events:Work:1000:2000',
          calendar: 'Work',
          start: 1000,
          end: 2000,
        }),
      )
    })

    it('puts a month together offline from the stored lists that overlap it', async () => {
      store.loadOverlapping.mockResolvedValue([
        { savedAt: 7, data: [event('e1', '2026-10-05T10:00:00Z')] },
        { savedAt: 3, data: [event('e2', '2026-11-02T10:00:00Z')] },
      ])
      const start = new Date('2026-10-01T00:00:00Z')
      const end = new Date('2026-11-01T00:00:00Z')
      const shown = await readCalendarEvents('u1', 'Work', start, end, async () => {
        throw offline()
      })
      expect(store.loadOverlapping).toHaveBeenCalledWith(
        'u1',
        'Work',
        start.getTime(),
        end.getTime(),
      )
      expect(shown.map((e) => e.id)).toStrictEqual(['e1'])
      expect(useOfflineStand().value).toBe(3)
    })

    it('fails as before when no stored list overlaps', async () => {
      store.loadOverlapping.mockResolvedValue([])
      await expect(
        readCalendarEvents('u1', 'Work', new Date(0), new Date(1), async () => {
          throw offline()
        }),
      ).rejects.toThrow('fetch failed')
    })
  })

  describe('mergeEvents', () => {
    const start = new Date('2026-10-01T00:00:00Z').getTime()
    const end = new Date('2026-11-01T00:00:00Z').getTime()

    it('keeps each event once, in its newest stored state', () => {
      const older = { ...event('e1', '2026-10-05'), title: 'old' }
      const newer = { ...event('e1', '2026-10-05'), title: 'new' }
      const merged = mergeEvents(
        [
          { key: 'a', uid: 'u1', savedAt: 1, data: [older] },
          { key: 'b', uid: 'u1', savedAt: 2, data: [newer] },
        ],
        start,
        end,
      )
      expect(merged).toStrictEqual([newer])
    })

    it('tells occurrences of a recurring event apart', () => {
      const merged = mergeEvents(
        [
          {
            key: 'a',
            uid: 'u1',
            savedAt: 1,
            data: [
              event('e1', '2026-10-05', '2026-10-05', 1),
              event('e1', '2026-10-12', '2026-10-12', 2),
            ],
          },
        ],
        start,
        end,
      )
      expect(merged).toHaveLength(2)
    })

    it('keeps events that run into the span and drops those outside it', () => {
      const merged = mergeEvents(
        [
          {
            key: 'a',
            uid: 'u1',
            savedAt: 1,
            data: [
              event('across', '2026-09-30T20:00:00Z', '2026-10-01T02:00:00Z'),
              event('before', '2026-09-20', '2026-09-21'),
              event('after', '2026-11-01T00:00:00Z'),
            ],
          },
        ],
        start,
        end,
      )
      expect(merged.map((e) => e.id)).toStrictEqual(['across'])
    })
  })

  it('names the month after the shown one, across the year end', () => {
    expect(nextMonthRange(2026, 12)).toStrictEqual({
      start: new Date(2027, 0, 1),
      end: new Date(2027, 1, 1),
    })
  })

  it.each([
    [offline(), true],
    [refused(500), false],
    [new Error('other'), false],
    [null, false],
    ['text', false],
  ])('tells a lost connection from everything else (%#)', (error, expected) => {
    expect(isNetworkError(error)).toBe(expected)
  })
})
