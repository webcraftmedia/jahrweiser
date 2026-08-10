// @vitest-environment node
import ICAL from 'ical.js'
import { describe, it, expect } from 'vitest'

import {
  RECURRING_EVENT,
  RECURRING_EVENT_OVERRIDE_FIRST,
  RECURRING_EVENT_OVERRIDE_MOVED_BACK,
  RECURRING_EVENT_WITH_OVERRIDE,
  RECURRING_EVENT_WITH_TIMEZONE,
  VCALENDAR_NO_VEVENT,
} from '../../test/fixtures/ical-data'

import {
  isPrivate,
  lastRelevantRecurrenceId,
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
