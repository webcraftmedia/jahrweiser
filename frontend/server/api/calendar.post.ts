import ICAL from 'ical.js'
import { z } from 'zod'

import {
  createCalDAVAccount,
  createCardDAVAccount,
  findCalendars,
  findEvents,
  findUserByEmail,
} from '../helpers/dav'

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
    const vcalendar = new ICAL.Component(ICAL.parse(data.props?.calendarData))
    // Register VTIMEZONE components so toJSDate() can resolve timezone offsets
    for (const vtimezone of vcalendar.getAllSubcomponents('vtimezone')) {
      ICAL.TimezoneService.register(new ICAL.Timezone(vtimezone))
    }
    const vevent = vcalendar.getFirstSubcomponent('vevent')
    if (vevent) {
      if (!showPrivate && vevent.getFirstProperty('class')?.getFirstValue() === 'PRIVATE') {
        return
      }
      const calEvent = new ICAL.Event(vevent)

      const isAllDay = calEvent.startDate.isDate

      if (calEvent.isRecurring()) {
        // Expandiere wiederkehrende Events
        const expand = new ICAL.RecurExpansion({
          component: vevent,
          dtstart: vevent.getFirstPropertyValue('dtstart') as ICAL.Time,
        })

        let count = 0
        let next
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ical.js types missing null return
        while ((next = expand.next())) {
          const occurrence = next.toJSDate()
          count += 1
          // Nur Events im gewünschten Zeitraum
          if (occurrence > endDate) break
          if (occurrence >= startDate) {
            const recEndDate = new Date(occurrence.getTime() + calEvent.duration.toSeconds() * 1000)
            if (isAllDay) {
              recEndDate.setDate(recEndDate.getDate() - 1) // DTEND is exclusive, subtract 1 day for inclusive end
            }
            results.push({
              calendar: selectedCalendar.displayName,
              color:
                typeof selectedCalendar.calendarColor === 'string'
                  ? selectedCalendar.calendarColor
                  : '#e7e7ff',
              id: hrefToId(data.href as string),
              occurrence: count,
              startDate: isAllDay ? occurrence.toISOString().slice(0, 10) : occurrence,
              endDate: isAllDay ? recEndDate.toISOString().slice(0, 10) : recEndDate,
              title: calEvent.summary,
              isRecurring: true,
            })
          }
        }
      } else {
        const sd = calEvent.startDate.toJSDate()
        const ed = calEvent.endDate.toJSDate()
        if (isAllDay) {
          ed.setDate(ed.getDate() - 1) // DTEND is exclusive, subtract 1 day for inclusive end
        }
        results.push({
          calendar: selectedCalendar.displayName,
          color:
            typeof selectedCalendar.calendarColor === 'string'
              ? selectedCalendar.calendarColor
              : '#e7e7ff',
          id: hrefToId(data.href as string),
          startDate: isAllDay ? sd.toISOString().slice(0, 10) : sd,
          endDate: isAllDay ? ed.toISOString().slice(0, 10) : ed,
          title: calEvent.summary,
        })
      }
    }
  })

  return results
})
