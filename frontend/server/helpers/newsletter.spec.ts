// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  ALLDAY_EVENT,
  PRIVATE_EVENT,
  RECURRING_EVENT,
  RECURRING_EVENT_WITH_TIMEZONE,
  SIMPLE_EVENT,
  VCALENDAR_NO_VEVENT,
} from '../../test/fixtures/ical-data'
import { createMockVCard } from '../../test/fixtures/vcard-data'

import {
  collectEventsForUser,
  formatDayHeadingDE,
  formatTimeDE,
  groupEventsByDay,
  nextWeekRange,
} from './newsletter'

import type { NewsletterEvent } from './newsletter'

const mockFindCalendars = vi.fn()
const mockFindEvents = vi.fn()
const mockFindUserByEmail = vi.fn()
const mockCreateCalDAVAccount = vi.fn().mockReturnValue({ accountType: 'caldav' })
const mockCreateCardDAVAccount = vi.fn().mockReturnValue({ accountType: 'carddav' })

vi.mock('./dav', () => ({
  createCalDAVAccount: (...args: unknown[]) => mockCreateCalDAVAccount(...args),
  createCardDAVAccount: (...args: unknown[]) => mockCreateCardDAVAccount(...args),
  findCalendars: (...args: unknown[]) => mockFindCalendars(...args),
  findEvents: (...args: unknown[]) => mockFindEvents(...args),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
}))

const DAV_CONFIG = {
  DAV_USERNAME: 'u',
  DAV_PASSWORD: 'p',
  DAV_URL: 'https://dav.example.com',
  DAV_URL_CARD: 'https://dav.example.com/card',
}

describe('nextWeekRange', () => {
  it('returns a 7-day window starting at the given moment', () => {
    const now = new Date('2026-03-01T18:00:00Z')
    const { from, to } = nextWeekRange(now)
    expect(from.toISOString()).toBe('2026-03-01T18:00:00.000Z')
    expect(to.toISOString()).toBe('2026-03-08T18:00:00.000Z')
  })

  it('defaults to the current time when no argument is passed', () => {
    const before = Date.now()
    const { from, to } = nextWeekRange()
    const after = Date.now()
    expect(from.getTime()).toBeGreaterThanOrEqual(before)
    expect(from.getTime()).toBeLessThanOrEqual(after)
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000)
  })
})

describe('formatDayHeadingDE', () => {
  it('formats Sunday March 1 2026 in German', () => {
    // 2026-03-01 is a Sunday
    expect(formatDayHeadingDE(new Date(2026, 2, 1))).toBe('Sonntag, 1. März')
  })

  it('formats a weekday with two-digit day in German', () => {
    // 2026-12-15 is a Tuesday
    expect(formatDayHeadingDE(new Date(2026, 11, 15))).toBe('Dienstag, 15. Dezember')
  })
})

describe('formatTimeDE', () => {
  it('pads hours and minutes with leading zeros', () => {
    expect(formatTimeDE(new Date(2026, 0, 1, 7, 5))).toBe('07:05')
  })

  it('formats 23:59 without truncating', () => {
    expect(formatTimeDE(new Date(2026, 0, 1, 23, 59))).toBe('23:59')
  })
})

describe('groupEventsByDay', () => {
  function ev(start: Date, title = 'X'): NewsletterEvent {
    return {
      calendar: 'C',
      color: '#000',
      id: 'i',
      startDate: start,
      endDate: start,
      allDay: false,
      title,
      detailUrl: '/x',
    }
  }

  it('returns empty array for empty input', () => {
    expect(groupEventsByDay([])).toStrictEqual([])
  })

  it('groups events by local calendar date', () => {
    const monMorning = new Date(2026, 2, 2, 9, 0)
    const monEvening = new Date(2026, 2, 2, 19, 0)
    const tue = new Date(2026, 2, 3, 12, 0)
    const groups = groupEventsByDay([ev(monMorning, 'A'), ev(tue, 'B'), ev(monEvening, 'C')])
    expect(groups).toHaveLength(2)
    expect(groups[0]!.date.getDate()).toBe(2)
    expect(groups[0]!.events.map((e) => e.title)).toStrictEqual(['A', 'C'])
    expect(groups[1]!.date.getDate()).toBe(3)
    expect(groups[1]!.events.map((e) => e.title)).toStrictEqual(['B'])
  })

  it('sorts buckets chronologically', () => {
    const later = new Date(2026, 2, 10, 9, 0)
    const earlier = new Date(2026, 2, 3, 9, 0)
    const groups = groupEventsByDay([ev(later, 'L'), ev(earlier, 'E')])
    expect(groups.map((g) => g.events[0]!.title)).toStrictEqual(['E', 'L'])
  })
})

describe('collectEventsForUser', () => {
  const range = {
    from: new Date('2025-02-25T00:00:00Z'),
    to: new Date('2025-03-10T00:00:00Z'),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFindCalendars.mockResolvedValue([
      { displayName: 'Work', url: 'https://dav.example.com/cal/work', calendarColor: '#ff0000' },
    ])
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf' },
      vcard: createMockVCard({ email: 'test@example.com', categories: ['Work'] }),
    })
    mockFindEvents.mockResolvedValue([])
  })

  it('returns empty array when no events exist', async () => {
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result).toStrictEqual([])
  })

  it('returns a simple event with calendar metadata and detail URL', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/simple-event-1.ics',
        props: { calendarData: SIMPLE_EVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      calendar: 'Work',
      color: '#ff0000',
      id: 'simple-event-1',
      title: 'Test Event',
      allDay: false,
    })
    // Detail URL mirrors src/pages/index.vue: /YYYY/MM/event/<id>
    expect(result[0]!.detailUrl).toBe('http://app.example.com/2025/03/event/simple-event-1')
  })

  it('strips trailing slash from clientUri when building detail URLs', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/simple-event-1.ics',
        props: { calendarData: SIMPLE_EVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com/',
      'test@example.com',
      range,
    )
    expect(result[0]!.detailUrl).toBe('http://app.example.com/2025/03/event/simple-event-1')
  })

  it('marks all-day events with allDay=true', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/allday-event-1.ics',
        props: { calendarData: ALLDAY_EVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result).toHaveLength(1)
    expect(result[0]!.allDay).toBe(true)
  })

  it('expands recurring events and adds occurrence to detail URL', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-event-1.ics',
        props: { calendarData: RECURRING_EVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0]!.occurrence).toBeGreaterThanOrEqual(1)
    expect(result[0]!.detailUrl).toMatch(
      /^http:\/\/app\.example\.com\/2025\/03\/event\/recurring-event-1\/\d+$/,
    )
  })

  it('skips recurring occurrences before range.from', async () => {
    // RECURRING_EVENT starts 2025-03-01 with WEEKLY COUNT=5 → 03-01, 03-08, 03-15, ...
    // A range of 03-05..03-12 means occurrence 1 (03-01) is skipped, 2 (03-08) kept.
    const narrowRange = {
      from: new Date('2025-03-05T00:00:00Z'),
      to: new Date('2025-03-12T00:00:00Z'),
    }
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-event-1.ics',
        props: { calendarData: RECURRING_EVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      narrowRange,
    )
    expect(result.length).toBeGreaterThanOrEqual(1)
    result.forEach((ev) => {
      expect(ev.startDate.getTime()).toBeGreaterThanOrEqual(narrowRange.from.getTime())
      expect(ev.startDate.getTime()).toBeLessThanOrEqual(narrowRange.to.getTime())
    })
  })

  it('filters CLASS:PRIVATE events when user lacks the calendar in CATEGORIES', async () => {
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf' },
      vcard: createMockVCard({ email: 'test@example.com', categories: ['Other'] }),
    })
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/private-event-1.ics',
        props: { calendarData: PRIVATE_EVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result).toHaveLength(0)
  })

  it('includes CLASS:PRIVATE events when user has matching CATEGORIES', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/private-event-1.ics',
        props: { calendarData: PRIVATE_EVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result).toHaveLength(1)
    expect(result[0]!.title).toBe('Private Meeting')
  })

  it('hides private events when user not in DAV at all', async () => {
    mockFindUserByEmail.mockResolvedValue(false)
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/private-event-1.ics',
        props: { calendarData: PRIVATE_EVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result).toHaveLength(0)
  })

  it('skips calendars without a displayName', async () => {
    mockFindCalendars.mockResolvedValue([
      { displayName: undefined, url: 'https://dav.example.com/cal/x', calendarColor: '#abc' },
    ])
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/x/simple-event-1.ics',
        props: { calendarData: SIMPLE_EVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result).toStrictEqual([])
    expect(mockFindEvents).not.toHaveBeenCalled()
  })

  it('uses default color when calendarColor is missing', async () => {
    mockFindCalendars.mockResolvedValue([
      { displayName: 'Work', url: 'https://dav.example.com/cal/work', calendarColor: undefined },
    ])
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/simple-event-1.ics',
        props: { calendarData: SIMPLE_EVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result[0]!.color).toBe('#e7e7ff')
  })

  it('skips VCALENDARs without a VEVENT', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/todo-1.ics',
        props: { calendarData: VCALENDAR_NO_VEVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result).toStrictEqual([])
  })

  it('drops one-off events outside the range', async () => {
    const narrowRange = {
      from: new Date('2025-04-01T00:00:00Z'),
      to: new Date('2025-04-10T00:00:00Z'),
    }
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/simple-event-1.ics',
        props: { calendarData: SIMPLE_EVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      narrowRange,
    )
    expect(result).toStrictEqual([])
  })

  it('sorts results chronologically across calendars', async () => {
    mockFindCalendars.mockResolvedValue([
      { displayName: 'Work', url: 'https://dav.example.com/cal/work', calendarColor: '#ff0000' },
      {
        displayName: 'Personal',
        url: 'https://dav.example.com/cal/personal',
        calendarColor: '#00ff00',
      },
    ])
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf' },
      vcard: createMockVCard({ email: 'test@example.com', categories: ['Work', 'Personal'] }),
    })
    const LATER_EVENT = SIMPLE_EVENT.replace('20250301', '20250305').replace(
      'simple-event-1',
      'simple-event-2',
    )
    mockFindEvents.mockImplementation(async (_account: unknown, url: string) => {
      if (url.endsWith('/work')) {
        return [
          {
            href: '/cal/work/later.ics',
            props: { calendarData: LATER_EVENT },
          },
        ]
      }
      return [
        {
          href: '/cal/personal/early.ics',
          props: { calendarData: SIMPLE_EVENT },
        },
      ]
    })
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result).toHaveLength(2)
    expect(result[0]!.startDate.getTime()).toBeLessThan(result[1]!.startDate.getTime())
  })

  it('registers VTIMEZONE so events with TZID resolve correctly', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-tz-1.ics',
        props: { calendarData: RECURRING_EVENT_WITH_TIMEZONE },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result.length).toBeGreaterThanOrEqual(1)
    // DTSTART;TZID=Europe/Berlin:20250301T190000 → 18:00 UTC (CET = UTC+1)
    expect(result[0]!.startDate.getUTCHours()).toBe(18)
  })

  it('handles user without categories property by treating CATEGORIES as empty', async () => {
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf' },
      vcard: createMockVCard({ email: 'test@example.com' }),
    })
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/private-event-1.ics',
        props: { calendarData: PRIVATE_EVENT },
      },
    ])
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    expect(result).toHaveLength(0)
  })
})
