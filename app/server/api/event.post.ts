import { z } from 'zod'

import { createCalDAVAccount, findCalendars, findEvent } from '../helpers/dav'
import { occurrenceAt, parseCalendarEvent } from '../helpers/ical'

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

  const parsed = parseCalendarEvent(caldata[0].data)

  if (!parsed) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  const { vevent, event: e } = parsed

  if (e.isRecurring() && occurrence) {
    // Expansion inkl. RECURRENCE-ID-Overrides liegt in helpers/ical.ts
    const details = occurrenceAt(parsed, occurrence)

    if (!details) {
      throw createError({ statusCode: 404, statusMessage: 'Event not found' })
    }

    const item = details.item
    return {
      description: item.description,
      duration: item.duration.toString(),
      endDate: details.endDate.toString(),
      location: item.location,
      startDate: details.startDate.toString(),
      summary: item.summary,
      uid: e.uid,
      url: item.component.getFirstPropertyValue('url') ?? '',
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
