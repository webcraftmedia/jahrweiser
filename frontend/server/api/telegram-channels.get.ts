import { asc } from 'drizzle-orm'

import type { TelegramChannel } from '~~/shared/telegram'

import { useDb } from '~~/server/db'
import { telegramChannels } from '~~/server/db/schema'
import { toChannel } from '~~/server/helpers/telegramChannels'

/**
 * The Telegram invitations shown on /telegram.
 *
 * Behind `requireUserSession` on purpose: a private invite link *is* the
 * permission — whoever holds it can join. Serving the list through
 * `runtimeConfig.public` would put it in the client bundle, readable by any
 * anonymous visitor in the page source.
 *
 * Administered from /admin/telegram; see server/db/schema/telegram-channels.ts
 * for why this is a table rather than the JSON file it used to be.
 */
export default defineEventHandler(async (event): Promise<TelegramChannel[]> => {
  await requireUserSession(event)

  const db = useDb()
  // `id` as the tie-break so the order is total: two rows may briefly share a
  // position while a move is being written.
  const rows = await db
    .select()
    .from(telegramChannels)
    .orderBy(asc(telegramChannels.sortOrder), asc(telegramChannels.id))

  return rows.map(toChannel)
})
