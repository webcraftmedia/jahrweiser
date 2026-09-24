import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { users } from '~~/server/db/schema'
import { recordEvent } from '~~/server/helpers/events'
import { requireAdmin } from '~~/server/helpers/requireAdmin'
import { applyTagChanges } from '~~/server/helpers/userTags'

/**
 * Set which calendars this member may see.
 *
 * No welcome mail from here, unlike the address-keyed route used by "Mitglied
 * hinzufügen": that mail introduces somebody to the Jahrweiser, and this page
 * adjusts an account that has existed for a while. Sending it again on every
 * checkbox would train members to ignore it.
 */

const bodySchema = z.object({
  tags: z.array(z.object({ name: z.string(), state: z.boolean() })),
})

export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)

  const uid = getRouterParam(event, 'uid')
  if (!uid) {
    throw createError({ statusCode: 400, statusMessage: 'Missing uid' })
  }

  const { tags } = await readValidatedBody(event, bodySchema.parse)

  const target = (
    await useDb().select({ email: users.email }).from(users).where(eq(users.uid, uid)).limit(1)
  )[0]
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }

  const { newTags } = await applyTagChanges(useRuntimeConfig(), actor.email, target.email, tags)

  await recordEvent({
    type: 'admin.tags_changed',
    userUid: uid,
    actorUid: actor.uid,
    // Calendar keys, not personal data — and exactly what a "why can I not see
    // the Vorstand calendar?" question needs answered.
    meta: { granted: newTags, calendars: tags.filter((t) => t.state).map((t) => t.name) },
    event,
  })

  return { granted: newTags }
})
