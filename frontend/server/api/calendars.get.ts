import { createCalDAVAccount, findCalendars } from '../helpers/dav'

const config = useRuntimeConfig()

export default defineEventHandler(async (event) => {
  // make sure the user is logged in
  // This will throw a 401 error if the request doesn't come from a valid user session
  await requireUserSession(event)

  // Calendars
  const calDavAccount = createCalDAVAccount(config)
  const calendars = await findCalendars(calDavAccount)

  return calendars.map((cal) => {
    return {
      name: cal.displayName,
      color: typeof cal.calendarColor === 'string' ? cal.calendarColor : '#e7e7ff',
    }
  })
})
