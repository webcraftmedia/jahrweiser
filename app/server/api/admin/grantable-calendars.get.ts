import {
  calendarKey,
  calendarLabel,
  createCalDAVAccount,
  findCalendars,
} from '~~/server/helpers/dav'
import { findGrantableCalendars } from '~~/server/helpers/registrationLinks'

// The calendars the calling admin may bind a registration link to: their own
// X-ADMIN-TAGS. Deliberately not the full calendar list from
// server/api/calendars.get.ts - an admin may only hand out what they administer,
// the same gate server/api/admin/updateUserTags.post.ts applies.
//
// Returns the stable key plus its display label, because the key is what gets
// stored and the label is what a human picks from. Keys with no matching
// calendar are dropped: this is a picker, and offering a calendar that no longer
// exists would only produce a grant that can never match.
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const config = useRuntimeConfig()
  const grantable = await findGrantableCalendars(config, session.user.email)
  const calendars = await findCalendars(createCalDAVAccount(config))

  return calendars
    .filter((cal) => grantable.includes(calendarKey(cal)))
    .map((cal) => ({ key: calendarKey(cal), label: calendarLabel(cal) }))
})
