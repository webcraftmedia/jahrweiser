import { findGrantableCalendars } from '~~/server/helpers/registrationLinks'

// The calendars the calling admin may bind a registration link to: their own
// X-ADMIN-TAGS. Deliberately not the full calendar list from
// server/api/calendars.get.ts - an admin may only hand out what they administer,
// the same gate server/api/admin/updateUserTags.post.ts applies.
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  return findGrantableCalendars(useRuntimeConfig(), session.user.email)
})
