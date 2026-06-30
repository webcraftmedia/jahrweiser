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

  // Only deactivated links may be deleted — deactivate first, then delete.
  const link = (
    await db
      .select({ revokedAt: registrationLinks.revokedAt })
      .from(registrationLinks)
      .where(eq(registrationLinks.token, token))
      .limit(1)
  )[0]
  if (!link) {
    throw createError({ statusCode: 404, statusMessage: 'Link not found' })
  }
  if (link.revokedAt === null) {
    throw createError({ statusCode: 409, statusMessage: 'Link is active' })
  }

  // ...and only if it was never redeemed — this preserves the join history.
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
