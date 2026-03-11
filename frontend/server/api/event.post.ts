import ICAL from 'ical.js'
import { z } from 'zod'

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

  let selectedCalendar
  let caldata

  try {
    const calDavAccount = createCalDAVAccount(config)
    const calendars = await findCalendars(calDavAccount)

    selectedCalendar = calendars.find((cal) => cal.displayName === calendar)

    if (!selectedCalendar) {
      throw createError({ statusCode: 404, statusMessage: 'Calendar not found' })
    }

    // Calendar data
    caldata = await findEvent(calDavAccount, selectedCalendar.url, id)
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err
    console.error('DAV connection error for event:', err)
    throw createError({ statusCode: 502, statusMessage: 'CalDAV server unreachable' })
  }

  if (caldata.length !== 1 || !caldata[0]?.data) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  const vcalendar = new ICAL.Component(ICAL.parse(caldata[0].data))
  // Register VTIMEZONE components so toJSDate() can resolve timezone offsets
  for (const vtimezone of vcalendar.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(new ICAL.Timezone(vtimezone))
  }
  const vevent = vcalendar.getFirstSubcomponent('vevent')

  if (!vevent) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
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

    const rEnd = next.clone()
    rEnd.addDuration(e.duration)
    return {
      description: e.description,
      duration: e.duration.toString(),
      endDate: rEnd.toString(),
      location: e.location,
      startDate: next.toString(),
      summary: e.summary,
      uid: e.uid,
      url: vevent.getFirstPropertyValue('url') ?? '',
    }
  } else {
    return {
      description: e.description,
      duration: e.duration.toString(),
      endDate: e.endDate.toString(),
      location: e.location,
      startDate: e.startDate.toString(),
      summary: e.summary,
      uid: e.uid,
      url: vevent.getFirstPropertyValue('url') ?? '',
    }
  }
})
