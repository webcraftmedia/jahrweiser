import { eq } from 'drizzle-orm'

import { useDb } from '~~/server/db'
import { users } from '~~/server/db/schema'
import { requireAdmin } from '~~/server/helpers/requireAdmin'
import { tagStateFor } from '~~/server/helpers/userTags'

/**
 * Which calendars this member may see, keyed by uid.
 *
 * The same answer `admin/getUserTags` gives for an address — but the members'
 * area only ever holds a uid, and routing this through the address would mean
 * sending it to the browser for the sake of a checkbox list.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)

  const uid = getRouterParam(event, 'uid')
  if (!uid) {
    throw createError({ statusCode: 400, statusMessage: 'Missing uid' })
  }

  const target = (
    await useDb().select({ email: users.email }).from(users).where(eq(users.uid, uid)).limit(1)
  )[0]
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }

  return { tags: await tagStateFor(useRuntimeConfig(), actor.email, target.email) }
})
