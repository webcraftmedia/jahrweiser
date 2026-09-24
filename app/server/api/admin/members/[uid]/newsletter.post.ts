import { randomBytes } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { users } from '~~/server/db/schema'
import { recordEvent } from '~~/server/helpers/events'
import { requireAdmin } from '~~/server/helpers/requireAdmin'

/**
 * Switch a member's newsletter subscription on their behalf.
 *
 * For the member who says "take me off that list" on the phone rather than
 * through the settings page — and for putting somebody back on who unsubscribed
 * by pressing their mail client's button without noticing.
 *
 * Recorded as `admin.newsletter_changed` rather than as the member's own
 * `newsletter.subscribed`: the chronicle should not make somebody else's
 * decision look like theirs. The unsubscribe token is minted here for the same
 * reason it is in `me/newsletter.post.ts` — every mail needs one in its
 * List-Unsubscribe header, and a member switched on by an admin is no different.
 */

const bodySchema = z.object({
  subscribed: z.boolean(),
})

export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)

  const uid = getRouterParam(event, 'uid')
  if (!uid) {
    throw createError({ statusCode: 400, statusMessage: 'Missing uid' })
  }

  const { subscribed } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const target = (
    await db
      .select({ uid: users.uid, unsubscribeToken: users.unsubscribeToken })
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1)
  )[0]
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }

  await db
    .update(users)
    .set({
      newsletterSubscribed: subscribed ? 'subscribed' : 'unsubscribed',
      unsubscribeToken: target.unsubscribeToken ?? randomBytes(32).toString('hex'),
    })
    .where(eq(users.uid, uid))

  await recordEvent({
    type: 'admin.newsletter_changed',
    userUid: uid,
    actorUid: actor.uid,
    meta: { subscribed },
    event,
  })

  return { subscribed }
})
