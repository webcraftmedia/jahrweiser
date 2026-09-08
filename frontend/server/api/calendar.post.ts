import { z } from 'zod'

import {
  createCalDAVAccount,
  createCardDAVAccount,
  findCalendars,
  findEvents,
  findUserByEmail,
} from '../helpers/dav'
import {
  collectOccurrences,
  parseCalendarEvent,
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

  const color =
    typeof selectedCalendar.calendarColor === 'string' ? selectedCalendar.calendarColor : '#e7e7ff'

  caldata.forEach((data) => {
    const parsed = parseCalendarEvent(data.props?.calendarData)
    if (!parsed) return

    // Expansion inkl. RECURRENCE-ID-Overrides liegt in helpers/ical.ts
    for (const occ of collectOccurrences(
      parsed,
      { from: startDate, to: endDate },
      { showPrivate },
    )) {
      const entry: Record<string, unknown> = {
        calendar: selectedCalendar.displayName,
        color,
        id: hrefToId(data.href as string),
        startDate: occ.allDay ? toDateString(occ.startDate) : occ.startDate.toJSDate(),
        endDate: occ.allDay
          ? toInclusiveEndDateString(occ.endDate) // DTEND is exclusive
          : occ.endDate.toJSDate(),
        title: occ.item.summary,
      }
      if (occ.occurrence !== undefined) {
        entry.occurrence = occ.occurrence
        entry.isRecurring = true
      }
      results.push(entry)
    }
  })

  return results
})
