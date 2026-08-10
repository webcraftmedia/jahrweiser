import { z } from 'zod'

import {
  createCalDAVAccount,
  createCardDAVAccount,
  findCalendars,
  findEvents,
  findUserByEmail,
} from '../helpers/dav'
import {
  isPrivate,
  lastRelevantRecurrenceId,
  parseCalendarEvent,
  toComparableDate,
  toDateString,
  toInclusiveEndDateString,
} from '../helpers/ical'

const bodySchema = z.object({
  calendar: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
})

const config = useRuntimeConfig()

function hrefToId(href: string) {
  const lastSlashIndex = href.lastIndexOf('/')
  return href.slice(lastSlashIndex + 1, -4)
}

export default defineEventHandler(async (event) => {
  // make sure the user is logged in
  // This will throw a 401 error if the request doesn't come from a valid user session
  const session = await requireUserSession(event)

  const { calendar, startDate, endDate } = await readValidatedBody(event, bodySchema.parse)

  // Restrict how far back users can browse: previous month + 7 days buffer
  const now = new Date()
  const firstOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const earliestAllowed = new Date(firstOfPreviousMonth.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (startDate < earliestAllowed) {
    return []
  }

  let selectedCalendar
  let caldata
  let userQuery

  try {
    const calDavAccount = createCalDAVAccount(config)
    const calendars = await findCalendars(calDavAccount)

    selectedCalendar = calendars.find((cal) => cal.displayName === calendar)

    if (!selectedCalendar) {
      throw createError({ statusCode: 404, statusMessage: `Calendar "${calendar}" not found` })
    }

    // Find dav user
    const cardDavAccount = createCardDAVAccount(config)
    userQuery = await findUserByEmail(cardDavAccount, session.user.email)

    // Calendar data
    caldata = await findEvents(calDavAccount, selectedCalendar.url, startDate, endDate)
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err
    console.error(`DAV connection error for calendar "${calendar}":`, err)
    throw createError({ statusCode: 502, statusMessage: 'CalDAV server unreachable' })
  }

  const showPrivate = userQuery
    ? ((
        userQuery.vcard.getFirstProperty('categories')?.getValues() as string[] | undefined
      )?.includes(calendar) ?? false)
    : false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = []

  caldata.forEach((data) => {
    const parsed = parseCalendarEvent(data.props?.calendarData)
    if (parsed) {
      const { vevent, event: calEvent, exceptions } = parsed
      if (!showPrivate && isPrivate(vevent)) {
        return
      }

      const isAllDay = calEvent.startDate.isDate

      if (calEvent.isRecurring()) {
        // Expandiere wiederkehrende Events. Der Iterator läuft über die
        // RRULE-Termine, getOccurrenceDetails() legt die RECURRENCE-ID-
        // Overrides (verschobene/geänderte Einzeltermine) darüber.
        const iterator = calEvent.iterator()
        const iterateUntil = lastRelevantRecurrenceId(exceptions, endDate)

        let count = 0
        let next
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ical.js types missing null return
        while ((next = iterator.next())) {
          count += 1
          // Abbruch, sobald die Serie den Zeitraum verlassen hat — aber erst,
          // wenn auch kein Override mehr in den Zeitraum vorgezogen wurde
          const recurrenceId = toComparableDate(next)
          if (recurrenceId > endDate && (!iterateUntil || recurrenceId > iterateUntil)) break

          const details = calEvent.getOccurrenceDetails(next)
          // Overrides können eine eigene CLASS tragen
          if (!showPrivate && isPrivate(details.item.component)) continue

          const occurrence = toComparableDate(details.startDate)
          // Nur Events im gewünschten Zeitraum
          if (occurrence > endDate || occurrence < startDate) continue

          const occurrenceIsAllDay = details.startDate.isDate
          results.push({
            calendar: selectedCalendar.displayName,
            color:
              typeof selectedCalendar.calendarColor === 'string'
                ? selectedCalendar.calendarColor
                : '#e7e7ff',
            id: hrefToId(data.href as string),
            occurrence: count,
            startDate: occurrenceIsAllDay ? toDateString(details.startDate) : occurrence,
            endDate: occurrenceIsAllDay
              ? toInclusiveEndDateString(details.endDate) // DTEND is exclusive
              : details.endDate.toJSDate(),
            title: details.item.summary,
            isRecurring: true,
          })
        }
      } else {
        results.push({
          calendar: selectedCalendar.displayName,
          color:
            typeof selectedCalendar.calendarColor === 'string'
              ? selectedCalendar.calendarColor
              : '#e7e7ff',
          id: hrefToId(data.href as string),
          startDate: isAllDay ? toDateString(calEvent.startDate) : calEvent.startDate.toJSDate(),
          endDate: isAllDay
            ? toInclusiveEndDateString(calEvent.endDate) // DTEND is exclusive
            : calEvent.endDate.toJSDate(),
          title: calEvent.summary,
        })
      }
    }
  })

  return results
})
