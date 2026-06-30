import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { registrationLinkRedemptions, registrationLinks } from '~~/server/db/schema'

const bodySchema = z.object({
  token: z.string(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const { token } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  // Only links that were never redeemed may be deleted — this preserves the
  // join history (revoke is the path for links that already have redemptions).
  const useCount = Number(
    (
      await db
        .select({ count: sql<string>`count(*)` })
        .from(registrationLinkRedemptions)
        .where(eq(registrationLinkRedemptions.linkToken, token))
    )[0]?.count ?? 0,
  )
  if (useCount > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Link has redemptions' })
  }

  await db.delete(registrationLinks).where(eq(registrationLinks.token, token))
  return {}
})
