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
  isoWeekNumber,
  nextWeekRange,
  renderNewsletterText,
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
  it('formats Sunday March 1 2026 in German for Europe/Berlin', () => {
    // Noon UTC of 2026-03-01 falls on Sun in Berlin (CET) — independent of the
    // server's own TZ.
    expect(formatDayHeadingDE(new Date(Date.UTC(2026, 2, 1, 12)), 'Europe/Berlin')).toBe(
      'Sonntag, 1. März',
    )
  })

  it('formats a weekday with two-digit day in German', () => {
    // Tue 2026-12-15 noon UTC
    expect(formatDayHeadingDE(new Date(Date.UTC(2026, 11, 15, 12)), 'Europe/Berlin')).toBe(
      'Dienstag, 15. Dezember',
    )
  })

  it('uses the target timezone, not the server clock (DST regression)', () => {
    // 22:30 UTC on Sun 2026-05-24 = 00:30 Berlin on Mon 2026-05-25 (CEST = UTC+2).
    // Formatting in UTC would print "Sonntag, 24. Mai"; the correct heading is
    // the Berlin calendar day.
    expect(formatDayHeadingDE(new Date('2026-05-24T22:30:00Z'), 'Europe/Berlin')).toBe(
      'Montag, 25. Mai',
    )
  })
})

describe('isoWeekNumber', () => {
  it('returns the ISO week for a mid-week date', () => {
    // Wed 2026-05-27 → ISO week 22
    expect(isoWeekNumber(new Date(Date.UTC(2026, 4, 27)))).toBe(22)
  })

  it('treats Sunday as the last day of the same ISO week', () => {
    // Sun 2026-05-24 closes ISO week 21
    expect(isoWeekNumber(new Date(Date.UTC(2026, 4, 24)))).toBe(21)
  })

  it('treats Monday as the first day of a new ISO week', () => {
    // Mon 2026-05-25 opens ISO week 22
    expect(isoWeekNumber(new Date(Date.UTC(2026, 4, 25)))).toBe(22)
  })

  it('handles year boundaries: 2025-12-29 (Mon) belongs to ISO week 1 of 2026', () => {
    expect(isoWeekNumber(new Date(Date.UTC(2025, 11, 29)))).toBe(1)
  })

  it('handles year boundaries: 2027-01-01 (Fri) belongs to ISO week 53 of 2026', () => {
    expect(isoWeekNumber(new Date(Date.UTC(2027, 0, 1)))).toBe(53)
  })
})

describe('formatTimeDE', () => {
  it('pads hours and minutes with leading zeros', () => {
    // 07:05 Berlin (CET, UTC+1) = 06:05 UTC
    expect(formatTimeDE(new Date('2026-01-01T06:05:00Z'), 'Europe/Berlin')).toBe('07:05')
  })

  it('formats 23:59 without truncating', () => {
    // 23:59 Berlin (CET, UTC+1) = 22:59 UTC
    expect(formatTimeDE(new Date('2026-01-01T22:59:00Z'), 'Europe/Berlin')).toBe('23:59')
  })

  it('respects CEST (UTC+2): 18:00 Berlin formats as 18:00, not 16:00', () => {
    // Reported bug: server in UTC printed "16:00" for an event meant to read
    // "18:00 Berlin". `Intl.DateTimeFormat` with `timeZone: 'Europe/Berlin'`
    // handles the summer-time offset correctly.
    expect(formatTimeDE(new Date('2026-05-24T16:00:00Z'), 'Europe/Berlin')).toBe('18:00')
  })

  it('renders midnight as 00:00 (hourCycle h23)', () => {
    // 00:00 Berlin (CET, UTC+1) = 23:00 UTC of the previous day.
    expect(formatTimeDE(new Date('2025-12-31T23:00:00Z'), 'Europe/Berlin')).toBe('00:00')
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
    expect(groupEventsByDay([], 'Europe/Berlin')).toStrictEqual([])
  })

  it('groups events by calendar date in the target timezone', () => {
    // Mon 2026-03-02: 09:00 Berlin (CET, UTC+1) = 08:00 UTC; 19:00 Berlin = 18:00 UTC.
    // Tue 2026-03-03: 12:00 Berlin = 11:00 UTC.
    const monMorning = new Date('2026-03-02T08:00:00Z')
    const monEvening = new Date('2026-03-02T18:00:00Z')
    const tue = new Date('2026-03-03T11:00:00Z')
    const groups = groupEventsByDay(
      [ev(monMorning, 'A'), ev(tue, 'B'), ev(monEvening, 'C')],
      'Europe/Berlin',
    )
    expect(groups).toHaveLength(2)
    expect(formatDayHeadingDE(groups[0]!.date, 'Europe/Berlin')).toBe('Montag, 2. März')
    expect(groups[0]!.events.map((e) => e.title)).toStrictEqual(['A', 'C'])
    expect(formatDayHeadingDE(groups[1]!.date, 'Europe/Berlin')).toBe('Dienstag, 3. März')
    expect(groups[1]!.events.map((e) => e.title)).toStrictEqual(['B'])
  })

  it('buckets late-night events by the Berlin calendar day, not by UTC date', () => {
    // 22:30 UTC Sun 2026-05-24 = 00:30 CEST Mon 2026-05-25.
    // Without zone-aware bucketing the event would land under Sunday.
    const lateNight = new Date('2026-05-24T22:30:00Z')
    const groups = groupEventsByDay([ev(lateNight, 'A')], 'Europe/Berlin')
    expect(groups).toHaveLength(1)
    expect(formatDayHeadingDE(groups[0]!.date, 'Europe/Berlin')).toBe('Montag, 25. Mai')
  })

  it('sorts buckets chronologically', () => {
    const later = new Date('2026-03-10T08:00:00Z')
    const earlier = new Date('2026-03-03T08:00:00Z')
    const groups = groupEventsByDay([ev(later, 'L'), ev(earlier, 'E')], 'Europe/Berlin')
    expect(groups.map((g) => g.events[0]!.title)).toStrictEqual(['E', 'L'])
  })
})

describe('renderNewsletterText', () => {
  const baseArgs = {
    greetingName: 'Alice',
    organizationUrl: 'http://app.example.com',
    settingsUrl: 'http://app.example.com/settings',
    unsubscribeUrl: 'http://app.example.com/api/newsletter/unsubscribe?token=abc',
  }

  it('includes a named greeting and intro on their own lines', () => {
    const out = renderNewsletterText({ ...baseArgs, days: [] })
    const [g, blank, intro] = out.split('\n')
    expect(g).toBe('Hallo Alice,')
    expect(blank).toBe('')
    expect(intro).toContain('Übersicht')
  })

  it('drops the name from the greeting when null', () => {
    const out = renderNewsletterText({ ...baseArgs, greetingName: null, days: [] })
    expect(out.split('\n')[0]).toBe('Hallo,')
  })

  it('shows the noEvents message when days is empty', () => {
    const out = renderNewsletterText({ ...baseArgs, days: [] })
    expect(out).toContain('keine Termine')
  })

  it('renders each event as a single line: time [calendar] title url', () => {
    const out = renderNewsletterText({
      ...baseArgs,
      days: [
        {
          heading: 'Freitag, 22. Mai',
          events: [
            {
              title: 'Probe Theater AG',
              calendar: 'Theater AG',
              allDay: false,
              timeLabel: '16:00',
              detailUrl: 'http://app.example.com/2026/05/event/e1',
            },
          ],
        },
      ],
    })
    expect(out).toContain('FREITAG, 22. MAI')
    expect(out).toContain('────────────────────────')
    expect(out).toContain(
      '16:00 [Theater AG] Probe Theater AG http://app.example.com/2026/05/event/e1',
    )
    expect(out).not.toContain('Details ansehen')
  })

  it('omits the time prefix entirely for all-day events (no leading indent)', () => {
    const out = renderNewsletterText({
      ...baseArgs,
      days: [
        {
          heading: 'Montag, 25. Mai',
          events: [
            {
              title: 'Vereinsausflug',
              calendar: 'Vereinskalender',
              allDay: true,
              timeLabel: '',
              detailUrl: 'http://app.example.com/2026/05/event/e2',
            },
            {
              title: 'Filmabend',
              calendar: 'Theater AG',
              allDay: false,
              timeLabel: '20:00',
              detailUrl: 'http://app.example.com/2026/05/event/e3',
            },
          ],
        },
      ],
    })
    // All-day line starts at column 0, no padding.
    expect(out).toContain(
      '\n[Vereinskalender] Vereinsausflug http://app.example.com/2026/05/event/e2',
    )
    expect(out).toContain('20:00 [Theater AG] Filmabend http://app.example.com/2026/05/event/e3')
    expect(out).not.toMatch(/^ +\[/m)
  })

  it('ends with calendar / settings / unsubscribe links on single lines (no wrap)', () => {
    const out = renderNewsletterText({ ...baseArgs, days: [] })
    expect(out).toContain('Alle Termine im Kalender: http://app.example.com')
    expect(out).toContain('Einstellungen ändern: http://app.example.com/settings')
    expect(out).toContain(
      'Newsletter abbestellen: http://app.example.com/api/newsletter/unsubscribe?token=abc',
    )
  })

  it('wraps long event lines and indents the continuation by two spaces', () => {
    const out = renderNewsletterText({
      ...baseArgs,
      days: [
        {
          heading: 'Freitag, 22. Mai',
          events: [
            {
              title: 'Probe Theater AG',
              calendar: 'Theater AG',
              allDay: false,
              timeLabel: '16:00',
              detailUrl:
                'http://app.example.com/2026/05/event/seed-event-today-with-a-really-long-id',
            },
          ],
        },
      ],
    })
    expect(out).toContain('16:00 [Theater AG] Probe Theater AG\n  http://')
  })

  it('indents every continuation chunk when an event line wraps multiple times', () => {
    const out = renderNewsletterText({
      ...baseArgs,
      days: [
        {
          heading: 'Freitag, 22. Mai',
          events: [
            {
              title: 'Sehr ausführlicher Titel der Veranstaltung mit vielen Wörtern',
              calendar: 'Veranstaltungskalender',
              allDay: false,
              timeLabel: '16:00',
              detailUrl:
                'http://app.example.com/2026/05/event/seed-event-today-with-a-really-long-id',
            },
          ],
        },
      ],
    })
    // The line is long enough to wrap twice: once mid-title, once before the
    // URL. Every continuation chunk gets the two-space indent.
    expect(out).toContain(
      '16:00 [Veranstaltungskalender] Sehr ausführlicher Titel der Veranstaltung mit\n' +
        '  vielen Wörtern\n' +
        '  http://app.example.com/2026/05/event/seed-event-today-with-a-really-long-id',
    )
  })

  it('does not HTML-encode quotes in titles', () => {
    const out = renderNewsletterText({
      ...baseArgs,
      days: [
        {
          heading: 'Montag, 25. Mai',
          events: [
            {
              title: 'Premiere "Drei Schwestern"',
              calendar: 'Theater AG',
              allDay: false,
              timeLabel: '19:00',
              detailUrl: 'http://app.example.com/2026/05/event/e3',
            },
          ],
        },
      ],
    })
    expect(out).toContain('Premiere "Drei Schwestern"')
    expect(out).not.toContain('&quot;')
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
    // Color is assigned by calendar index — first calendar gets
    // designPalette[0].mail (vivid orange). The `calendarColor` from DAV is
    // intentionally ignored.
    expect(result[0]).toMatchObject({
      calendar: 'Work',
      color: '#ea580c',
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

  it('assigns colors by calendar index, ignoring DAV calendarColor', async () => {
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
        return [{ href: '/cal/work/a.ics', props: { calendarData: SIMPLE_EVENT } }]
      }
      return [{ href: '/cal/personal/b.ics', props: { calendarData: LATER_EVENT } }]
    })
    const result = await collectEventsForUser(
      DAV_CONFIG,
      'http://app.example.com',
      'test@example.com',
      range,
    )
    // First calendar → designPalette[0].mail (orange), second → designPalette[1].mail (violet).
    const workEvent = result.find((e) => e.calendar === 'Work')
    const personalEvent = result.find((e) => e.calendar === 'Personal')
    expect(workEvent?.color).toBe('#ea580c')
    expect(personalEvent?.color).toBe('#9333ea')
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
