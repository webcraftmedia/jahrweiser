import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { telegramChannels } from '~~/server/db/schema'

/**
 * Removes an invitation from the list.
 *
 * Irreversible in the sense that matters: a private invite link cannot be
 * looked up again in Telegram, it has to be re-issued there. The admin page
 * therefore asks twice before calling this.
 */
const bodySchema = z.object({
  id: z.number().int().positive(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const { id } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const existing = (
    await db
      .select({ name: telegramChannels.name })
      .from(telegramChannels)
      .where(eq(telegramChannels.id, id))
      .limit(1)
  )[0]
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  }

  await db.delete(telegramChannels).where(eq(telegramChannels.id, id))

  // The remaining positions keep their relative order; the gap this leaves is
  // closed by the next move (see move.post.ts, which rewrites the whole
  // sequence) and is invisible in the meantime.
  console.warn(`Telegram channel "${existing.name}" deleted by ${session.user.email}`)
  return {}
})
