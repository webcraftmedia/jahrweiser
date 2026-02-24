import { z } from 'zod'
import ICAL from 'ical.js'
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

  const calDavAccount = createCalDAVAccount(config)
  const calendars = await findCalendars(calDavAccount)

  const selectedCalendar = calendars.find((cal) => cal.displayName === calendar)

  if (!selectedCalendar) {
    throw new Error('Calendar not found')
  }

  // Find dav user
  const cardDavAccount = createCardDAVAccount(config)
  const userQuery = await findUserByEmail(cardDavAccount, session.user.email)
  const showPrivate =
    !userQuery ||
    (userQuery.vcard.getFirstProperty('categories')?.getValues() as string[]).find(
      (tag) => tag === calendar,
    )

  // Calendar data
  const caldata = await findEvents(calDavAccount, selectedCalendar.url, startDate, endDate)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = []

  caldata.forEach((data) => {
    const vcalendar = new ICAL.Component(ICAL.parse(data.props?.calendarData))
    vcalendar.getFirstPropertyValue()
    const vevent = vcalendar.getFirstSubcomponent('vevent')
    if (vevent) {
      if (!showPrivate && vevent.getFirstProperty('class')?.getFirstValue() === 'PRIVATE') {
        return
      }
      const calEvent = new ICAL.Event(vevent)

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
          const occurrence = new Date(next.toString() + 'Z') // Fix German Time
          count += 1
          // Nur Events im gewünschten Zeitraum
          if (occurrence > endDate) break
          if (occurrence >= startDate) {
            const recEndDate = new Date(occurrence.getTime() + calEvent.duration.toSeconds() * 1000)
            results.push({
              calendar: selectedCalendar.displayName,
              color:
                typeof selectedCalendar.calendarColor === 'string'
                  ? selectedCalendar.calendarColor
                  : '#e7e7ff',
              id: hrefToId(data.href as string),
              occurrence: count,
              startDate: occurrence,
              endDate: recEndDate,
              title: calEvent.summary,
              isRecurring: true,
            })
          }
        }
      } else {
        const sd = calEvent.startDate.toJSDate()
        const ed = calEvent.endDate.toJSDate()
        if (calEvent.duration.days > 0 || calEvent.duration.weeks > 0) {
          ed.setMilliseconds(ed.getMilliseconds() - 1) // Correct Full day thingy
        }
        results.push({
          calendar: selectedCalendar.displayName,
          color:
            typeof selectedCalendar.calendarColor === 'string'
              ? selectedCalendar.calendarColor
              : '#e7e7ff',
          id: hrefToId(data.href as string),
          startDate: sd,
          endDate: ed,
          title: calEvent.summary,
        })
      }
    }
  })

  return results
})
