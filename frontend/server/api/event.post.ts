import { z } from 'zod'
import { calendarQuery, DAVNamespaceShort } from "tsdav"
import ICAL from 'ical.js'

const bodySchema = z.object({
  id: z.string(),
  occurrence: z.int().optional(),
})


export default defineEventHandler(async (event) => {
  // make sure the user is logged in
  // This will throw a 401 error if the request doesn't come from a valid user session
  await requireUserSession(event)

  const config = useRuntimeConfig()

  const { id, occurrence } = await readValidatedBody(event, bodySchema.parse)
  // Calendar data
  const caldata = await calendarQuery({
    url: config.DAV_URL_CAL,
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
            'prop-filter': {
                _attributes: {
                    name: 'UID'
                },
                'text-match': id,
            },
          }
        },
      },
    
    depth: '1',
    headers: {
      authorization: 'Basic '+btoa(unescape(encodeURIComponent(config.DAV_USERNAME + ':' + config.DAV_PASSWORD))),
    },
  });

  if(caldata.length < 1){
  //if(caldata.length !== 1){
    console.log(caldata)
    throw new Error('event not found')
  }

  const vcalendar = new ICAL.Component(ICAL.parse(caldata[0].props?.calendarData));
  vcalendar.getFirstPropertyValue()
  // console.log(vcalendar.toString())
  const vevent = vcalendar.getFirstSubcomponent('vevent')
  
  if(!vevent){
    throw new Error('event not found')
  }

  const e = new ICAL.Event(vevent)

  if (e.isRecurring() && occurrence) {
      // Expandiere wiederkehrende Events
      const expand = new ICAL.RecurExpansion({
        component: vevent,
        dtstart: vevent.getFirstPropertyValue('dtstart') as ICAL.Time
      })
          
      let next = expand.next()
      for(let i=1;i<occurrence;i++){
          next = expand.next()
      }

      const rStartDate = new Date(new Date(next.toString()+'Z').toLocaleString('en-US', { timeZone: 'Europe/Berlin' })) // Fix German Time
      const rEndDate = new Date(rStartDate.getTime()+e.duration.toSeconds() * 1000)
      return {
        description: e.description?.toString(),
        duration: e.duration.toString(),
        endDate: rEndDate.toISOString().slice(0,19),
        location: e.location?.toString(),
        startDate: rStartDate.toISOString().slice(0,19),
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
