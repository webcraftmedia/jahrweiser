import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { telegramChannels } from '~~/server/db/schema'
import { channelInputSchema } from '~~/server/helpers/telegramChannels'

/**
 * Edits one invitation. Every admin may edit every channel — see create.post.ts
 * for why this is not owner-only like the registration links.
 *
 * The position is not part of this: it changes through move.post.ts, so a
 * concurrent edit of a channel's text cannot silently reshuffle the list.
 */
const bodySchema = channelInputSchema.extend({
  id: z.number().int().positive(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const {
    id,
    name,
    description,
    url,
    public: isPublic,
  } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const existing = (
    await db
      .select({ id: telegramChannels.id })
      .from(telegramChannels)
      .where(eq(telegramChannels.id, id))
      .limit(1)
  )[0]
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  }

  await db
    .update(telegramChannels)
    .set({
      name,
      description: description || null,
      url,
      isPublic: isPublic ?? false,
    })
    .where(eq(telegramChannels.id, id))

  return {}
})
