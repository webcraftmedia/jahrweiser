import { z } from 'zod'

import type { TelegramChannelRow } from '~~/server/db/schema'
import type { TelegramChannel } from '~~/shared/telegram'

import {
  isTelegramUrl,
  TELEGRAM_DESCRIPTION_MAX,
  TELEGRAM_NAME_MAX,
  TELEGRAM_URL_MAX,
  TELEGRAM_URL_PREFIX,
} from '~~/shared/telegram'

/**
 * The fields an admin may set. Identical for create and update, so the two
 * endpoints cannot drift apart in what they accept.
 */
export const channelInputSchema = z.object({
  name: z.string().trim().min(1).max(TELEGRAM_NAME_MAX),
  description: z.string().trim().max(TELEGRAM_DESCRIPTION_MAX).optional(),
  url: z
    .url()
    .max(TELEGRAM_URL_MAX)
    .refine(isTelegramUrl, { message: `must be a ${TELEGRAM_URL_PREFIX} link` }),
  public: z.boolean().optional(),
})

export type ChannelInput = z.infer<typeof channelInputSchema>

/**
 * A database row as the client sees it. `description` is omitted rather than
 * sent as null, so the page can keep using `v-if="channel.description"`.
 */
export function toChannel(row: TelegramChannelRow): TelegramChannel {
  return {
    id: row.id,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    url: row.url,
    public: row.isPublic,
  }
}
