import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { registrationLinks } from '~~/server/db/schema'

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

  // Soft-disable: keep the row (and its join history) but mark it unusable.
  // Only stamp links that aren't already revoked so the timestamp reflects the
  // first revoke.
  await db
    .update(registrationLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(registrationLinks.token, token), isNull(registrationLinks.revokedAt)))

  return {}
})
