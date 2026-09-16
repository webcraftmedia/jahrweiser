import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { registrationLinks } from '~~/server/db/schema'
import { assertLinkOwner } from '~~/server/helpers/registrationLinks'

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

  // Reactivating is owner-only: any admin may deactivate an abused link, but
  // only its creator may put it back into circulation.
  const link = (
    await db
      .select({ createdByUid: registrationLinks.createdByUid })
      .from(registrationLinks)
      .where(eq(registrationLinks.token, token))
      .limit(1)
  )[0]
  assertLinkOwner(link?.createdByUid, session.user.uid)

  await db
    .update(registrationLinks)
    .set({ revokedAt: null })
    .where(eq(registrationLinks.token, token))
  return {}
})
