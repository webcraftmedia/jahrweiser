import { randomBytes } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../../db'
import { users } from '../../db/schema'

const bodySchema = z.object({
  subscribed: z.boolean(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const uid = (session.user as { uid?: string }).uid
  if (!uid) {
    throw createError({ statusCode: 401, statusMessage: 'No user context' })
  }

  const { subscribed } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const row = (
    await db
      .select({ unsubscribeToken: users.unsubscribeToken })
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1)
  )[0]
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // Lazy-generate the unsubscribe token on first subscribe — every user that
  // ever receives a newsletter needs a stable token in the List-Unsubscribe
  // header. We do this on subscribe (not on sign-up) so legacy users get one
  // automatically when they opt in.
  const ensuredToken = row.unsubscribeToken ?? randomBytes(32).toString('hex')

  await db
    .update(users)
    .set({
      newsletterSubscribed: subscribed ? 'subscribed' : 'unsubscribed',
      unsubscribeToken: ensuredToken,
    })
    .where(eq(users.uid, uid))

  return { subscribed }
})
