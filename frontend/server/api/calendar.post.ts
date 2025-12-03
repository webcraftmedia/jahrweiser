import { z } from 'zod'
import ICAL from 'ical.js'
import { findEvents } from '../helpers/dav'

const bodySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
})

const config = useRuntimeConfig()

export default defineEventHandler(async (event) => {
  // make sure the user is logged in
  // This will throw a 401 error if the request doesn't come from a valid user session
  await requireUserSession(event)

  const { startDate, endDate } = await readValidatedBody(event, bodySchema.parse)
  // Calendar data
  const caldata = await findEvents(config, startDate, endDate)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = []

  caldata.forEach((data) => {
    const vcalendar = new ICAL.Component(ICAL.parse(data.props?.calendarData))
    vcalendar.getFirstPropertyValue()
    const vevent = vcalendar.getFirstSubcomponent('vevent')
    if (vevent) {
      const event = new ICAL.Event(vevent)

      if (event.isRecurring()) {
        // Expandiere wiederkehrende Events
        const expand = new ICAL.RecurExpansion({
          component: vevent,
          dtstart: vevent.getFirstPropertyValue('dtstart') as ICAL.Time,
        })

        let count = 0
        let next
        while ((next = expand.next())) {
          const occurrence = new Date(next.toString() + 'Z') // Fix German Time
          count += 1
          // Nur Events im gewünschten Zeitraum
          if (occurrence > endDate) break
          if (occurrence >= startDate) {
            const endDate = new Date(occurrence.getTime() + event.duration.toSeconds() * 1000)
            results.push({
              id: hrefToId(data.href as string),
              occurrence: count,
              startDate: occurrence,
              endDate,
              title: event.summary,
              isRecurring: true,
            })
          }
        }
      } else {
        const sd = event.startDate.toJSDate()
        const ed = event.endDate.toJSDate()
        if (event.duration.days > 0 || event.duration.weeks > 0) {
          ed.setMilliseconds(ed.getMilliseconds() - 1) // Correct Full day thingy
        }
        results.push({
          id: hrefToId(data.href as string),
          startDate: sd,
          endDate: ed,
          title: event.summary,
        })
      }
    }
  })

  return results
})

function hrefToId(href: string) {
  return href.slice(config.DAV_URL_CAL.length, -4)
}
