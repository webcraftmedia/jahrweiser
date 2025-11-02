import { z } from 'zod'
import { calendarQuery, DAVNamespaceShort } from "tsdav"
import ICAL from 'ical.js'
import { headers } from '../helpters/dav'

const bodySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
})

export default defineEventHandler(async (event) => {
  // make sure the user is logged in
  // This will throw a 401 error if the request doesn't come from a valid user session
  await requireUserSession(event)

  const config = useRuntimeConfig()

  const { startDate, endDate } = await readValidatedBody(event, bodySchema.parse)
  // Calendar data
  const caldata = await calendarQuery({
    url: config.DAV_URL + config.DAV_URL_CAL,
    props: {
      [`${DAVNamespaceShort.DAV}:getetag`]: {},
      [`${DAVNamespaceShort.CALDAV}:calendar-data`]: {}
    },
    filters:
      {
        ['comp-filter']: {
          _attributes: {
            name: 'VCALENDAR',
          },
          'comp-filter': {
            _attributes: {
              name: 'VEVENT',
            },
            'time-range': {
              _attributes: {
                start: formatDate(startDate),
                end: formatDate(endDate),
              }
            },
          }
        },
      },
    depth: '1',
    headers,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results:any[] = []

  caldata.forEach((data)=>{
    const vcalendar = new ICAL.Component(ICAL.parse(data.props?.calendarData));
    vcalendar.getFirstPropertyValue()
    const vevent = vcalendar.getFirstSubcomponent('vevent')
    if(vevent){
      const event = new ICAL.Event(vevent)

      if (event.isRecurring()) {
        // Expandiere wiederkehrende Events
        const expand = new ICAL.RecurExpansion({
          component: vevent,
          dtstart: vevent.getFirstPropertyValue('dtstart') as ICAL.Time
        })

        let count = 0
        let next
        while ((next = expand.next())) {
          // const occurrence = next.toJSDate()
          // occurrence.setHours(occurrence.getHours() + 1)
          const occurrence = new Date(new Date(next.toString()+'Z').toLocaleString('en-US', { timeZone: 'Europe/Berlin' })) // Fix German Time
          count += 1
          // Nur Events im gewünschten Zeitraum
          if (occurrence > endDate) break
          if (occurrence >= startDate) {
            const endDate = new Date(occurrence.getTime()+event.duration.toSeconds() * 1000)
            results.push({
              id: event.uid,
              occurrence: count,
              startDate: occurrence,
              endDate,
              title: event.summary,
              isRecurring: true
            })
          }
        }
      } else {
        const sd = new Date(new Date(event.startDate.toString()+'Z').toLocaleString('en-US', { timeZone: 'Europe/Berlin' })) // Fix German Time
        const ed = new Date(new Date(event.endDate.toString()+'Z').toLocaleString('en-US', { timeZone: 'Europe/Berlin' })) // Fix German Time
        if(event.duration.days > 0 || event.duration.weeks > 0){
          ed.setMilliseconds(ed.getMilliseconds() -1) // Correct Full day thingy
        }
        results.push({
          id: event.uid,
          startDate: sd,
          endDate: ed,
          title: event.summary,
        })
      }
    }

  })

  return results
})

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}T${hours}${minutes}${seconds}`
}