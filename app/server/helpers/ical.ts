import ICAL from 'ical.js'

export interface ParsedCalendarEvent {
  /** The master VEVENT (the one carrying the RRULE), never an override. */
  vevent: ICAL.Component
  /** ICAL.Event for the master, with all RECURRENCE-ID overrides related to it. */
  event: ICAL.Event
  /** The override VEVENTs (moved or edited single occurrences) of this series. */
  exceptions: ICAL.Component[]
}

/**
 * Parses a single iCalendar object (one .ics resource) into its master event.
 *
 * A recurring event is stored as several VEVENTs sharing one UID: the master
 * with the RRULE plus one override per modified occurrence, each carrying a
 * RECURRENCE-ID (RFC 5545 §3.8.4.4). Their order inside the VCALENDAR is not
 * defined, so the master must be picked by the absence of RECURRENCE-ID rather
 * than by position. ICAL.Event relates the overrides automatically via the
 * component's parent, which makes getOccurrenceDetails() return the effective
 * data per occurrence.
 *
 * @returns null when the object holds no VEVENT at all.
 */
export function parseCalendarEvent(calendarData: string): ParsedCalendarEvent | null {
  const vcalendar = new ICAL.Component(ICAL.parse(calendarData))
  // Register VTIMEZONE components so toJSDate() can resolve timezone offsets
  for (const vtimezone of vcalendar.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(new ICAL.Timezone(vtimezone))
  }

  const vevents = vcalendar.getAllSubcomponents('vevent')
  const exceptions = vevents.filter((v) => v.hasProperty('recurrence-id'))
  // Fall back to the first VEVENT if every one of them is an override — the
  // master may be missing from a partial export.
  const vevent = vevents.find((v) => !v.hasProperty('recurrence-id')) ?? vevents[0]

  if (!vevent) return null

  return { vevent, event: new ICAL.Event(vevent), exceptions }
}

/** True when the VEVENT is marked CLASS:PRIVATE. */
export function isPrivate(vevent: ICAL.Component): boolean {
  return vevent.getFirstProperty('class')?.getFirstValue() === 'PRIVATE'
}

/**
 * YYYY-MM-DD of an all-day date.
 *
 * ICAL.Time.toJSDate() resolves a date-only value to *local* midnight, so
 * round-tripping it through toISOString() shifts the day in any timezone east
 * of UTC. Formatting the calendar fields directly keeps the date stable.
 */
export function toDateString(time: ICAL.Time): string {
  const month = String(time.month).padStart(2, '0')
  const day = String(time.day).padStart(2, '0')
  return `${String(time.year).padStart(4, '0')}-${month}-${day}`
}

/** YYYY-MM-DD of the last day an all-day event covers (DTEND is exclusive). */
export function toInclusiveEndDateString(time: ICAL.Time): string {
  const inclusive = time.clone()
  inclusive.adjust(-1, 0, 0, 0)
  return toDateString(inclusive)
}

/**
 * JS Date usable for range comparisons — all-day values are anchored at UTC
 * midnight so they are not pushed out of a UTC query window by the server's
 * local timezone.
 */
export function toComparableDate(time: ICAL.Time): Date {
  return time.isDate ? new Date(Date.UTC(time.year, time.month - 1, time.day)) : time.toJSDate()
}

/**
 * Latest RECURRENCE-ID that still has to be visited when expanding a series up
 * to `endDate`.
 *
 * Expansion walks the RRULE, so it is driven by the *original* occurrence times.
 * An override moved to an earlier date sits in the window while its
 * RECURRENCE-ID is already past it, so stopping at `endDate` would drop it.
 *
 * @returns null when no override has been moved backwards into the window.
 */
export function lastRelevantRecurrenceId(exceptions: ICAL.Component[], endDate: Date): Date | null {
  let latest: Date | null = null

  for (const exception of exceptions) {
    // An override always carries a RECURRENCE-ID — that is what makes it one
    const recurrenceId = toComparableDate(
      exception.getFirstPropertyValue('recurrence-id') as ICAL.Time,
    )
    const startTime = exception.getFirstPropertyValue('dtstart') as ICAL.Time | null
    if (!startTime) continue
    const start = toComparableDate(startTime)
    // Only occurrences moved backwards into the window matter here
    if (recurrenceId <= endDate || start > endDate) continue
    if (!latest || recurrenceId > latest) latest = recurrenceId
  }

  return latest
}

export interface DateRange {
  from: Date
  to: Date
}

/** One occurrence of an event, with any RECURRENCE-ID override already applied. */
export interface EventOccurrence {
  /**
   * 1-based position within the RRULE expansion — the value that addresses this
   * occurrence in a detail URL. Undefined for non-recurring events.
   */
  occurrence?: number
  startDate: ICAL.Time
  endDate: ICAL.Time
  /** Per occurrence: an override may turn a single date into an all-day one. */
  allDay: boolean
  /** Effective event data — the override when one applies, else the master. */
  item: ICAL.Event
}

function toOccurrence(startDate: ICAL.Time, endDate: ICAL.Time, item: ICAL.Event): EventOccurrence {
  return { startDate, endDate, allDay: startDate.isDate, item }
}

/**
 * True when `[start, end)` overlaps `range`.
 *
 * DTEND is exclusive (RFC 5545 §3.8.2.2), so an event ending exactly at
 * `range.from` is already over. The exception is a DTSTART without DTEND and
 * without DURATION: ical.js reports `endDate === startDate` for those, and a
 * zero-length event can only be matched on its start instant.
 */
function overlapsRange(start: Date, end: Date, range: DateRange): boolean {
  if (start > range.to) return false
  return end.getTime() === start.getTime() ? start >= range.from : end > range.from
}

/**
 * Every occurrence of one iCalendar object that overlaps `range`.
 *
 * This is the single place that turns a VEVENT into occurrences. The calendar
 * view, the detail view and the newsletter each used to expand the series
 * themselves, so the override handling only ever got fixed in some of them.
 *
 * Private events are dropped unless `showPrivate` — checked per occurrence,
 * since an override may carry a CLASS of its own.
 */
export function collectOccurrences(
  parsed: ParsedCalendarEvent,
  range: DateRange,
  options: { showPrivate: boolean },
): EventOccurrence[] {
  const { vevent, event, exceptions } = parsed

  if (!options.showPrivate && isPrivate(vevent)) return []

  if (!event.isRecurring()) {
    const start = toComparableDate(event.startDate)
    const end = toComparableDate(event.endDate)
    return overlapsRange(start, end, range)
      ? [toOccurrence(event.startDate, event.endDate, event)]
      : []
  }

  // The iterator walks the RRULE; getOccurrenceDetails() lays the
  // RECURRENCE-ID overrides (moved or edited single occurrences) on top.
  const iterator = event.iterator()
  const iterateUntil = lastRelevantRecurrenceId(exceptions, range.to)
  const results: EventOccurrence[] = []

  let count = 0
  let next
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ical.js types missing null return
  while ((next = iterator.next())) {
    count += 1
    // Stop once the series has left the window — but not before the last
    // override that was pulled back into it has been visited.
    const recurrenceId = toComparableDate(next)
    if (recurrenceId > range.to && (!iterateUntil || recurrenceId > iterateUntil)) break

    const details = event.getOccurrenceDetails(next)
    if (!options.showPrivate && isPrivate(details.item.component)) continue

    const start = toComparableDate(details.startDate)
    const end = toComparableDate(details.endDate)
    if (!overlapsRange(start, end, range)) continue

    results.push({
      ...toOccurrence(details.startDate, details.endDate, details.item),
      occurrence: count,
    })
  }

  return results
}

/**
 * The `n`-th occurrence (1-based) of a series with its override applied — the
 * counterpart to the `occurrence` index handed out by `collectOccurrences`.
 *
 * @returns null when the series ends before reaching `n`.
 */
export function occurrenceAt(parsed: ParsedCalendarEvent, n: number): EventOccurrence | null {
  const iterator = parsed.event.iterator()

  let next
  for (let i = 0; i < n; i++) {
    next = iterator.next()
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ical.js types missing null return
    if (!next) return null
  }
  if (!next) return null

  const details = parsed.event.getOccurrenceDetails(next)
  return toOccurrence(details.startDate, details.endDate, details.item)
}
