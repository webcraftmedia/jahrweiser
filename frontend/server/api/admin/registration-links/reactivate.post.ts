import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { registrationLinks } from '~~/server/db/schema'

const bodySchema = z.object({
  token: z.string(),
})

// Undo a revoke: clear `revoked_at`. The link's other gates (expiry, max uses)
// still apply, so a reactivated link may still be expired/exhausted.
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const { token } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  await db
    .update(registrationLinks)
    .set({ revokedAt: null })
    .where(eq(registrationLinks.token, token))
  return {}
})
