import { max } from 'drizzle-orm'

import { useDb } from '~~/server/db'
import { telegramChannels } from '~~/server/db/schema'
import { channelInputSchema } from '~~/server/helpers/telegramChannels'

/**
 * Adds a Telegram invitation to the list on /telegram.
 *
 * Admin-only, and every admin may do it: the channel list is the community's
 * shared configuration, not the property of whoever typed it in. Who that was
 * is still recorded, because a private invite link is a permission and its
 * origin is worth knowing.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const input = await readValidatedBody(event, channelInputSchema.parse)
  const db = useDb()

  // Appended at the end; from there an admin moves it where it belongs.
  const [aggregate] = await db
    .select({ value: max(telegramChannels.sortOrder) })
    .from(telegramChannels)

  await db.insert(telegramChannels).values({
    name: input.name,
    description: input.description || null,
    url: input.url,
    isPublic: input.public ?? false,
    sortOrder: (aggregate?.value ?? -1) + 1,
    createdByUid: session.user.uid,
  })

  return {}
})
