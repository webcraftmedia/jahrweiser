// @vitest-environment node
import '../../test/setup-server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  SIMPLE_EVENT,
  ALLDAY_EVENT,
  RECURRING_EVENT,
  RECURRING_EVENT_WITH_TIMEZONE,
  PRIVATE_EVENT,
  VCALENDAR_NO_VEVENT,
  RECURRING_ALLDAY_EVENT,
  RECURRING_ALLDAY_EVENT_WITH_OVERRIDE,
  RECURRING_EVENT_OVERRIDE_FIRST,
  RECURRING_EVENT_OVERRIDE_MOVED_BACK,
  RECURRING_EVENT_PRIVATE_OVERRIDE,
  RECURRING_EVENT_WITH_OVERRIDE,
} from '../../test/fixtures/ical-data'
import { createMockVCard } from '../../test/fixtures/vcard-data'

import handler from './calendar.post'

const mockFindCalendars = vi.fn()
const mockFindEvents = vi.fn()
const mockFindUserByEmail = vi.fn()
const mockCreateCalDAVAccount = vi.fn().mockReturnValue({ accountType: 'caldav' })
const mockCreateCardDAVAccount = vi.fn().mockReturnValue({ accountType: 'carddav' })

vi.mock('../helpers/dav', () => ({
  createCalDAVAccount: (...args: unknown[]) => mockCreateCalDAVAccount(...args),
  createCardDAVAccount: (...args: unknown[]) => mockCreateCardDAVAccount(...args),
  findCalendars: (...args: unknown[]) => mockFindCalendars(...args),
  findEvents: (...args: unknown[]) => mockFindEvents(...args),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
}))

const handlerFn = handler as unknown as (event: unknown) => Promise<unknown>

describe('calendar.post', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-04-01T12:00:00Z'))
    vi.clearAllMocks()
    vi.mocked(globalThis.requireUserSession).mockResolvedValue({
      user: { name: 'Test', email: 'test@example.com', role: 'user' },
    })
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        calendar: 'Work',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-04-01T00:00:00Z',
      })
    })
    mockFindCalendars.mockResolvedValue([
      { displayName: 'Work', url: 'https://dav.example.com/cal/work', calendarColor: '#ff0000' },
    ])
    // Default: user found with categories
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf' },
      vcard: createMockVCard({ email: 'test@example.com', categories: ['Work'] }),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty array when startDate is too far in the past', async () => {
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        calendar: 'Work',
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-02-01T00:00:00Z',
      })
    })
    const result = await handlerFn({})
    expect(result).toStrictEqual([])
    // Should not even attempt to fetch calendars
    expect(mockFindCalendars).not.toHaveBeenCalled()
  })

  it('allows requests within the permitted past range', async () => {
    // With fake time at 2025-04-01, previous month is March, minus 7 days = Feb 22
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        calendar: 'Work',
        startDate: '2025-02-23T00:00:00Z',
        endDate: '2025-03-31T00:00:00Z',
      })
    })
    mockFindEvents.mockResolvedValue([])
    const result = await handlerFn({})
    expect(result).toStrictEqual([])
    // Should proceed to fetch calendars
    expect(mockFindCalendars).toHaveBeenCalled()
  })

  it('throws when calendar not found', async () => {
    mockFindCalendars.mockResolvedValue([])
    await expect(handlerFn({})).rejects.toThrow('Calendar "Work" not found')
  })

  it('throws 502 when DAV connection fails', async () => {
    mockFindCalendars.mockRejectedValue(new Error('ECONNREFUSED'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(handlerFn({})).rejects.toThrow('CalDAV server unreachable')
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('re-throws errors with statusCode from DAV helpers', async () => {
    const httpError = Object.assign(new Error('Not Found'), { statusCode: 404 })
    mockFindCalendars.mockRejectedValue(httpError)
    await expect(handlerFn({})).rejects.toThrow(httpError.message)
  })

  it('returns event array for simple event', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/simple-event-1.ics',
        props: { calendarData: SIMPLE_EVENT },
      },
    ])
    const result = (await handlerFn({})) as unknown[]
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      calendar: 'Work',
      color: '#ff0000',
      id: 'simple-event-1',
      title: 'Test Event',
    })
  })

  it('expands recurring events', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-event-1.ics',
        props: { calendarData: RECURRING_EVENT },
      },
    ])
    const result = (await handlerFn({})) as unknown[]
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0]).toMatchObject({
      title: 'Weekly Meeting',
      isRecurring: true,
    })
  })

  it('filters private events when user lacks tag', async () => {
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
    const result = (await handlerFn({})) as unknown[]
    expect(result).toHaveLength(0)
  })

  it('includes private events when user has matching tag', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/private-event-1.ics',
        props: { calendarData: PRIVATE_EVENT },
      },
    ])
    const result = (await handlerFn({})) as unknown[]
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ title: 'Private Meeting' })
  })

  it('hides private events when user not in DAV', async () => {
    mockFindUserByEmail.mockResolvedValue(false)
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/private-event-1.ics',
        props: { calendarData: PRIVATE_EVENT },
      },
    ])
    const result = (await handlerFn({})) as unknown[]
    expect(result).toHaveLength(0)
  })

  it('sets endDate to last day for all-day events', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/allday-event-1.ics',
        props: { calendarData: ALLDAY_EVENT },
      },
    ])
    const result = (await handlerFn({})) as { startDate: string; endDate: string }[]
    expect(result).toHaveLength(1)
    // DTEND is exclusive (March 2), so endDate should be March 1 (same as start)
    // All-day events are returned as YYYY-MM-DD strings
    expect(result[0]!.endDate).toBe(result[0]!.startDate)
  })

  it('returns YYYY-MM-DD strings for recurring all-day events', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-allday-1.ics',
        props: { calendarData: RECURRING_ALLDAY_EVENT },
      },
    ])
    const result = (await handlerFn({})) as { startDate: string; endDate: string }[]
    expect(result.length).toBeGreaterThan(0)
    // All-day recurring events should be YYYY-MM-DD strings (10 chars)
    expect(result[0]!.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result[0]!.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // DTEND is exclusive, so endDate should equal startDate for single-day recurring events
    expect(result[0]!.endDate).toBe(result[0]!.startDate)
  })

  it('stops expanding recurring events past endDate', async () => {
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        calendar: 'Work',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-10T00:00:00Z',
      })
    })
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-event-1.ics',
        props: { calendarData: RECURRING_EVENT },
      },
    ])
    const result = (await handlerFn({})) as unknown[]
    // Should have events only within the date range (March 1 and March 8, but not March 15+)
    expect(result.length).toBeLessThanOrEqual(2)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('uses default color for recurring event when calendarColor is not a string', async () => {
    mockFindCalendars.mockResolvedValue([
      { displayName: 'Work', url: 'https://dav.example.com/cal/work', calendarColor: undefined },
    ])
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-event-1.ics',
        props: { calendarData: RECURRING_EVENT },
      },
    ])
    const result = (await handlerFn({})) as { color: string }[]
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0]!.color).toBe('#e7e7ff')
  })

  it('uses default color for simple event when calendarColor is not a string', async () => {
    mockFindCalendars.mockResolvedValue([
      { displayName: 'Work', url: 'https://dav.example.com/cal/work', calendarColor: undefined },
    ])
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/simple-event-1.ics',
        props: { calendarData: SIMPLE_EVENT },
      },
    ])
    const result = (await handlerFn({})) as { color: string }[]
    expect(result).toHaveLength(1)
    expect(result[0]!.color).toBe('#e7e7ff')
  })

  it('skips calendar data without VEVENT', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/todo-1.ics',
        props: { calendarData: VCALENDAR_NO_VEVENT },
      },
    ])
    const result = (await handlerFn({})) as unknown[]
    expect(result).toHaveLength(0)
  })

  it('skips recurring occurrences before startDate', async () => {
    vi.mocked(globalThis.readValidatedBody).mockImplementation(async (_event, validator) => {
      return (validator as (data: unknown) => unknown)({
        calendar: 'Work',
        startDate: '2025-03-05T00:00:00Z',
        endDate: '2025-04-01T00:00:00Z',
      })
    })
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-event-1.ics',
        props: { calendarData: RECURRING_EVENT },
      },
    ])
    const result = (await handlerFn({})) as { startDate: Date }[]
    // March 1 occurrence is before startDate (March 5), so it's skipped
    // Remaining occurrences: March 8, 15, 22, 29
    expect(result.length).toBeGreaterThanOrEqual(1)
    result.forEach((event) => {
      expect(event.startDate.getTime()).toBeGreaterThanOrEqual(
        new Date('2025-03-05T00:00:00Z').getTime(),
      )
    })
  })

  it('registers VTIMEZONE and converts recurring event times correctly', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-tz-1.ics',
        props: { calendarData: RECURRING_EVENT_WITH_TIMEZONE },
      },
    ])
    const result = (await handlerFn({})) as { startDate: Date; title: string }[]
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0]!.title).toBe('Berlin Recurring')
    // DTSTART;TZID=Europe/Berlin:20250301T190000 → 18:00 UTC (CET = UTC+1)
    expect(result[0]!.startDate.getUTCHours()).toBe(18)
  })

  it('hides private events when user has no categories property', async () => {
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
    const result = (await handlerFn({})) as unknown[]
    expect(result).toHaveLength(0)
  })

  it('applies RECURRENCE-ID overrides to moved occurrences', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-override-1.ics',
        props: { calendarData: RECURRING_EVENT_WITH_OVERRIDE },
      },
    ])
    const result = (await handlerFn({})) as {
      startDate: Date
      endDate: Date
      title: string
      occurrence: number
    }[]
    const days = result.map((e) => e.startDate.toISOString().slice(0, 10))
    // Third occurrence moved from Mar 15 to Mar 18
    expect(days).toStrictEqual([
      '2025-03-01',
      '2025-03-08',
      '2025-03-18',
      '2025-03-22',
      '2025-03-29',
    ])
    const moved = result[2]!
    expect(moved.title).toBe('Weekly Meeting (moved)')
    // Occurrence index still counts the series position, not the moved date
    expect(moved.occurrence).toBe(3)
    // Override has its own duration (1.5h instead of 1h)
    expect(moved.endDate.toISOString()).toBe('2025-03-18T11:30:00.000Z')
  })

  it('finds the master VEVENT when an override comes first', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-override-first-1.ics',
        props: { calendarData: RECURRING_EVENT_OVERRIDE_FIRST },
      },
    ])
    const result = (await handlerFn({})) as { startDate: Date; isRecurring?: boolean }[]
    // Whole series must expand, not just the leading override
    expect(result).toHaveLength(5)
    expect(result[0]!.isRecurring).toBe(true)
    expect(result.map((e) => e.startDate.toISOString().slice(0, 10))).toContain('2025-03-18')
  })

  it('includes occurrences pulled back into the window from beyond endDate', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-override-back-1.ics',
        props: { calendarData: RECURRING_EVENT_OVERRIDE_MOVED_BACK },
      },
    ])
    const result = (await handlerFn({})) as { startDate: Date; occurrence: number }[]
    const days = result.map((e) => e.startDate.toISOString().slice(0, 10))
    // Apr 5 (occurrence 6) was moved to Mar 30, so it belongs into the March window
    expect(days).toContain('2025-03-30')
    expect(result.find((e) => e.startDate.toISOString().startsWith('2025-03-30'))!.occurrence).toBe(
      6,
    )
  })

  it('hides occurrences whose override is CLASS:PRIVATE', async () => {
    mockFindUserByEmail.mockResolvedValue({
      user: { href: '/abc.vcf' },
      vcard: createMockVCard({ email: 'test@example.com', categories: ['Other'] }),
    })
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-private-override-1.ics',
        props: { calendarData: RECURRING_EVENT_PRIVATE_OVERRIDE },
      },
    ])
    const result = (await handlerFn({})) as { startDate: Date; title: string }[]
    expect(result).toHaveLength(4)
    expect(result.map((e) => e.title)).not.toContain('Internal Retro')
  })

  it('shows private overrides when user has matching tag', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-private-override-1.ics',
        props: { calendarData: RECURRING_EVENT_PRIVATE_OVERRIDE },
      },
    ])
    const result = (await handlerFn({})) as { title: string }[]
    expect(result).toHaveLength(5)
    expect(result.map((e) => e.title)).toContain('Internal Retro')
  })

  it('applies overrides to recurring all-day events', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/cal/work/recurring-allday-override-1.ics',
        props: { calendarData: RECURRING_ALLDAY_EVENT_WITH_OVERRIDE },
      },
    ])
    const result = (await handlerFn({})) as { startDate: string; endDate: string }[]
    expect(result.map((e) => e.startDate)).toStrictEqual(['2025-03-01', '2025-03-11', '2025-03-15'])
    // DTEND stays exclusive for the moved occurrence too
    expect(result[1]!.endDate).toBe('2025-03-11')
  })

  it('hrefToId extracts ID from path', async () => {
    mockFindEvents.mockResolvedValue([
      {
        href: '/dav.php/calendars/user/work/my-event-id.ics',
        props: { calendarData: SIMPLE_EVENT },
      },
    ])
    const result = (await handlerFn({})) as { id: string }[]
    expect(result[0]!.id).toBe('my-event-id')
  })
})
