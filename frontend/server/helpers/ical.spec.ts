// @vitest-environment node
import ICAL from 'ical.js'
import { describe, it, expect } from 'vitest'

import {
  ALLDAY_EVENT,
  MULTI_DAY_EVENT,
  PRIVATE_EVENT,
  RECURRING_ALLDAY_EVENT_WITH_OVERRIDE,
  RECURRING_EVENT,
  RECURRING_EVENT_OVERRIDE_FIRST,
  RECURRING_EVENT_OVERRIDE_MOVED_BACK,
  RECURRING_EVENT_PRIVATE_OVERRIDE,
  RECURRING_EVENT_WITH_OVERRIDE,
  RECURRING_EVENT_WITH_TIMEZONE,
  SIMPLE_EVENT,
  VCALENDAR_NO_VEVENT,
  ZERO_LENGTH_EVENT,
} from '../../test/fixtures/ical-data'

import {
  collectOccurrences,
  isPrivate,
  lastRelevantRecurrenceId,
  occurrenceAt,
  parseCalendarEvent,
  toComparableDate,
  toDateString,
  toInclusiveEndDateString,
} from './ical'

const ONLY_OVERRIDES = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:orphan-override-1
RECURRENCE-ID:20250315T100000Z
DTSTART:20250318T100000Z
DTEND:20250318T110000Z
SUMMARY:Orphan Override
END:VEVENT
END:VCALENDAR`

const OVERRIDE_WITHOUT_DTSTART = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART:20250301T100000Z
DTEND:20250301T110000Z
SUMMARY:Weekly Meeting
RRULE:FREQ=WEEKLY;COUNT=7
UID:broken-override-1
END:VEVENT
BEGIN:VEVENT
UID:broken-override-1
RECURRENCE-ID:20250405T100000Z
SUMMARY:Cancelled-ish
END:VEVENT
END:VCALENDAR`

describe('parseCalendarEvent', () => {
  it('returns null when the object holds no VEVENT', () => {
    expect(parseCalendarEvent(VCALENDAR_NO_VEVENT)).toBeNull()
  })

  it('separates master and overrides', () => {
    const parsed = parseCalendarEvent(RECURRING_EVENT_WITH_OVERRIDE)!
    expect(parsed.event.summary).toBe('Weekly Meeting')
    expect(parsed.exceptions).toHaveLength(1)
    expect(parsed.vevent.hasProperty('recurrence-id')).toBe(false)
  })

  it('picks the master even when an override comes first', () => {
    const parsed = parseCalendarEvent(RECURRING_EVENT_OVERRIDE_FIRST)!
    expect(parsed.event.isRecurring()).toBe(true)
    expect(parsed.vevent.hasProperty('recurrence-id')).toBe(false)
  })

  it('falls back to the first VEVENT when no master exists', () => {
    const parsed = parseCalendarEvent(ONLY_OVERRIDES)!
    expect(parsed.event.summary).toBe('Orphan Override')
    expect(parsed.exceptions).toHaveLength(1)
  })

  it('registers VTIMEZONE components', () => {
    parseCalendarEvent(RECURRING_EVENT_WITH_TIMEZONE)
    expect(ICAL.TimezoneService.has('Europe/Berlin')).toBe(true)
  })
})

describe('isPrivate', () => {
  it('detects CLASS:PRIVATE', () => {
    const parsed = parseCalendarEvent(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:p-1
DTSTART:20250301T100000Z
DTEND:20250301T110000Z
CLASS:PRIVATE
END:VEVENT
END:VCALENDAR`)!
    expect(isPrivate(parsed.vevent)).toBe(true)
  })

  it('treats a missing CLASS as public', () => {
    expect(isPrivate(parseCalendarEvent(RECURRING_EVENT)!.vevent)).toBe(false)
  })
})

describe('lastRelevantRecurrenceId', () => {
  const endDate = new Date('2025-04-01T00:00:00Z')

  it('returns the RECURRENCE-ID of an occurrence moved back into the window', () => {
    const { exceptions } = parseCalendarEvent(RECURRING_EVENT_OVERRIDE_MOVED_BACK)!
    expect(lastRelevantRecurrenceId(exceptions, endDate)).toStrictEqual(
      new Date('2025-04-05T10:00:00Z'),
    )
  })

  it('returns the latest of several relevant overrides', () => {
    const { exceptions } = parseCalendarEvent(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:multi-1
DTSTART:20250301T100000Z
DTEND:20250301T110000Z
RRULE:FREQ=WEEKLY;COUNT=9
END:VEVENT
BEGIN:VEVENT
UID:multi-1
RECURRENCE-ID:20250412T100000Z
DTSTART:20250330T100000Z
DTEND:20250330T110000Z
END:VEVENT
BEGIN:VEVENT
UID:multi-1
RECURRENCE-ID:20250405T100000Z
DTSTART:20250329T100000Z
DTEND:20250329T110000Z
END:VEVENT
END:VCALENDAR`)!
    expect(lastRelevantRecurrenceId(exceptions, endDate)).toStrictEqual(
      new Date('2025-04-12T10:00:00Z'),
    )
  })

  it('ignores overrides inside the window and those staying outside', () => {
    const { exceptions } = parseCalendarEvent(RECURRING_EVENT_WITH_OVERRIDE)!
    expect(lastRelevantRecurrenceId(exceptions, endDate)).toBeNull()
  })

  it('ignores overrides without DTSTART', () => {
    const { exceptions } = parseCalendarEvent(OVERRIDE_WITHOUT_DTSTART)!
    expect(exceptions).toHaveLength(1)
    expect(lastRelevantRecurrenceId(exceptions, endDate)).toBeNull()
  })
})

describe('collectOccurrences', () => {
  const MARCH = { from: new Date('2025-03-01T00:00:00Z'), to: new Date('2025-03-31T23:59:59Z') }
  const PUBLIC = { showPrivate: false }

  /** Start instants of the returned occurrences, as ISO strings. */
  const starts = (calendarData: string, range = MARCH, options = PUBLIC): string[] =>
    collectOccurrences(parseCalendarEvent(calendarData)!, range, options).map((o) =>
      toComparableDate(o.startDate).toISOString(),
    )

  it('applies a RECURRENCE-ID override to the moved occurrence', () => {
    // Series runs Mar 1, 8, 15, 22, 29 — the third occurrence is moved to Mar 18.
    expect(starts(RECURRING_EVENT_WITH_OVERRIDE)).toStrictEqual([
      '2025-03-01T10:00:00.000Z',
      '2025-03-08T10:00:00.000Z',
      '2025-03-18T10:00:00.000Z',
      '2025-03-22T10:00:00.000Z',
      '2025-03-29T10:00:00.000Z',
    ])
  })

  it('takes title, end and details of a moved occurrence from the override', () => {
    const moved = collectOccurrences(
      parseCalendarEvent(RECURRING_EVENT_WITH_OVERRIDE)!,
      MARCH,
      PUBLIC,
    )[2]!
    expect(moved.item.summary).toBe('Weekly Meeting (moved)')
    expect(moved.item.location).toBe('Room C')
    // Override runs 90 minutes instead of the master's 60
    expect(toComparableDate(moved.endDate).toISOString()).toBe('2025-03-18T11:30:00.000Z')
  })

  it('keeps the occurrence index on the RRULE position, not the sorted result', () => {
    // event.post.ts addresses an occurrence by this index, so it has to stay
    // aligned with the iterator even when an override moves the date around.
    const all = collectOccurrences(
      parseCalendarEvent(RECURRING_EVENT_WITH_OVERRIDE)!,
      MARCH,
      PUBLIC,
    )
    expect(all.map((o) => o.occurrence)).toStrictEqual([1, 2, 3, 4, 5])
    expect(occurrenceAt(parseCalendarEvent(RECURRING_EVENT_WITH_OVERRIDE)!, 3)!.item.summary).toBe(
      'Weekly Meeting (moved)',
    )
  })

  it('applies the override even when it precedes the master VEVENT', () => {
    expect(starts(RECURRING_EVENT_OVERRIDE_FIRST)).toStrictEqual([
      '2025-03-01T10:00:00.000Z',
      '2025-03-08T10:00:00.000Z',
      '2025-03-18T10:00:00.000Z',
      '2025-03-22T10:00:00.000Z',
      '2025-03-29T10:00:00.000Z',
    ])
  })

  it('includes an occurrence pulled back into the window from beyond it', () => {
    // The Apr 5 occurrence was moved to Mar 30 — expansion runs on the RRULE,
    // so it is only reached by iterating past the end of the window.
    const range = { from: new Date('2025-03-01T00:00:00Z'), to: new Date('2025-04-01T00:00:00Z') }
    expect(starts(RECURRING_EVENT_OVERRIDE_MOVED_BACK, range)).toContain('2025-03-30T10:00:00.000Z')
  })

  it('drops a single occurrence that its override marks CLASS:PRIVATE', () => {
    const titles = collectOccurrences(
      parseCalendarEvent(RECURRING_EVENT_PRIVATE_OVERRIDE)!,
      MARCH,
      PUBLIC,
    ).map((o) => o.item.summary)
    expect(titles).toHaveLength(4)
    expect(titles).not.toContain('Internal Retro')
  })

  it('keeps a privately overridden occurrence when showPrivate is set', () => {
    const all = collectOccurrences(parseCalendarEvent(RECURRING_EVENT_PRIVATE_OVERRIDE)!, MARCH, {
      showPrivate: true,
    })
    expect(all).toHaveLength(5)
    expect(all[2]!.item.summary).toBe('Internal Retro')
  })

  it('drops the whole event when the master is private', () => {
    expect(starts(PRIVATE_EVENT)).toStrictEqual([])
    expect(starts(PRIVATE_EVENT, MARCH, { showPrivate: true })).toHaveLength(1)
  })

  it('carries all-day through an override and reports allDay per occurrence', () => {
    const all = collectOccurrences(
      parseCalendarEvent(RECURRING_ALLDAY_EVENT_WITH_OVERRIDE)!,
      MARCH,
      PUBLIC,
    )
    expect(all.map((o) => toDateString(o.startDate))).toStrictEqual([
      '2025-03-01',
      '2025-03-11',
      '2025-03-15',
    ])
    expect(all.every((o) => o.allDay)).toBe(true)
  })

  it('reports a non-recurring event without an occurrence index', () => {
    const [only] = collectOccurrences(parseCalendarEvent(SIMPLE_EVENT)!, MARCH, PUBLIC)
    expect(only!.occurrence).toBeUndefined()
    expect(only!.allDay).toBe(false)
  })

  it('keeps an event that started before the window but reaches into it', () => {
    // Feb 28 18:00 → Mar 2 12:00 overlaps a window opening on Mar 1.
    expect(starts(MULTI_DAY_EVENT)).toStrictEqual(['2025-02-28T18:00:00.000Z'])
  })

  it('drops an event that ended exactly when the window opens', () => {
    // DTEND is exclusive: an all-day event on Feb 28 has DTEND Mar 1.
    const endsAtWindowStart = ALLDAY_EVENT.replace('20250301', '20250228').replace(
      '20250302',
      '20250301',
    )
    expect(starts(endsAtWindowStart)).toStrictEqual([])
  })

  it('matches a zero-length event on its start instant', () => {
    expect(starts(ZERO_LENGTH_EVENT)).toStrictEqual(['2025-03-01T10:00:00.000Z'])
    expect(
      starts(ZERO_LENGTH_EVENT, {
        from: new Date('2025-03-01T10:00:01Z'),
        to: new Date('2025-03-31T00:00:00Z'),
      }),
    ).toStrictEqual([])
  })

  it('drops an event lying entirely behind the window', () => {
    const range = { from: new Date('2025-06-01T00:00:00Z'), to: new Date('2025-06-30T00:00:00Z') }
    expect(starts(SIMPLE_EVENT, range)).toStrictEqual([])
    expect(starts(RECURRING_EVENT_WITH_OVERRIDE, range)).toStrictEqual([])
  })

  it('drops an event lying entirely ahead of the window', () => {
    const range = { from: new Date('2025-01-01T00:00:00Z'), to: new Date('2025-01-31T00:00:00Z') }
    expect(starts(SIMPLE_EVENT, range)).toStrictEqual([])
    expect(starts(RECURRING_EVENT_WITH_OVERRIDE, range)).toStrictEqual([])
  })
})

describe('occurrenceAt', () => {
  it('returns the n-th occurrence, 1-based', () => {
    const parsed = parseCalendarEvent(RECURRING_EVENT_WITH_OVERRIDE)!
    expect(toComparableDate(occurrenceAt(parsed, 1)!.startDate).toISOString()).toBe(
      '2025-03-01T10:00:00.000Z',
    )
    expect(toComparableDate(occurrenceAt(parsed, 5)!.startDate).toISOString()).toBe(
      '2025-03-29T10:00:00.000Z',
    )
  })

  it('returns null past the end of the series', () => {
    expect(occurrenceAt(parseCalendarEvent(RECURRING_EVENT)!, 99)).toBeNull()
  })

  it('returns null for a non-positive index', () => {
    expect(occurrenceAt(parseCalendarEvent(RECURRING_EVENT)!, 0)).toBeNull()
  })
})

describe('date formatting', () => {
  it('formats all-day dates independent of the server timezone', () => {
    const time = ICAL.Time.fromString('2025-03-01')
    expect(toDateString(time)).toBe('2025-03-01')
  })

  it('turns an exclusive DTEND into the last covered day', () => {
    expect(toInclusiveEndDateString(ICAL.Time.fromString('2025-03-02'))).toBe('2025-03-01')
  })

  it('anchors all-day values at UTC midnight for comparisons', () => {
    expect(toComparableDate(ICAL.Time.fromString('2025-03-01')).toISOString()).toBe(
      '2025-03-01T00:00:00.000Z',
    )
  })

  it('keeps the exact instant for timed values', () => {
    expect(toComparableDate(ICAL.Time.fromString('2025-03-01T10:00:00Z')).toISOString()).toBe(
      '2025-03-01T10:00:00.000Z',
    )
  })
})
