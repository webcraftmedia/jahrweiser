import { z } from 'zod'
import ICAL from 'ical.js'
import { createCalDAVAccount, findCalendars, findEvent } from '../helpers/dav'

const bodySchema = z.object({
  calendar: z.string(),
  id: z.string(),
  occurrence: z.int().optional(),
})

const config = useRuntimeConfig()

export default defineEventHandler(async (event) => {
  // make sure the user is logged in
  // This will throw a 401 error if the request doesn't come from a valid user session
  await requireUserSession(event)

  const { calendar, id, occurrence } = await readValidatedBody(event, bodySchema.parse)

  const calDavAccount = createCalDAVAccount(config)
  const calendars = await findCalendars(calDavAccount)

  const selectedCalendar = calendars.find((cal) => cal.displayName === calendar)

  if (!selectedCalendar) {
    throw new Error('Calendar not found')
  }

  // Calendar data
  const caldata = await findEvent(calDavAccount, selectedCalendar.url, id)

  if (caldata.length !== 1) {
    throw new Error('event not found')
  }

  const vcalendar = new ICAL.Component(ICAL.parse(caldata[0].data))
  vcalendar.getFirstPropertyValue()
  const vevent = vcalendar.getFirstSubcomponent('vevent')

  if (!vevent) {
    throw new Error('event not found')
  }

  const e = new ICAL.Event(vevent)
  // console.log(e)

  if (e.isRecurring() && occurrence) {
    // Expandiere wiederkehrende Events
    const expand = new ICAL.RecurExpansion({
      component: vevent,
      dtstart: vevent.getFirstPropertyValue('dtstart') as ICAL.Time,
    })

    let next = expand.next()
    for (let i = 1; i < occurrence; i++) {
      next = expand.next()
    }

    const rStartDate = new Date(next.toString() + 'Z') // Fix German Time
    const rEndDate = new Date(rStartDate.getTime() + e.duration.toSeconds() * 1000)
    return {
      description: e.description?.toString(),
      duration: e.duration.toString(),
      endDate: rEndDate.toISOString().slice(0, 19),
      location: e.location?.toString(),
      startDate: rStartDate.toISOString().slice(0, 19),
      summary: e.summary?.toString(),
      uid: e.uid?.toString(),
    }
  } else {
    return {
      description: e.description?.toString(),
      duration: e.duration.toString(),
      endDate: e.endDate?.toString(),
      location: e.location?.toString(),
      startDate: e.startDate?.toString(),
      summary: e.summary?.toString(),
      uid: e.uid?.toString(),
    }
  }
})
