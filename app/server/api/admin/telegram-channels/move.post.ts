import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { telegramChannels } from '~~/server/db/schema'

/**
 * Moves one channel one position up or down.
 *
 * The client sends only "this one, that way" — never the whole order. A stale
 * page (someone else added a channel meanwhile) can then not overwrite the
 * current order with what it happened to be showing.
 *
 * The whole sequence is rewritten as a dense 0..n-1 afterwards, which also
 * heals the gaps left by deletions and the duplicate zeroes an import leaves
 * behind. The list is a handful of rows, so the loop is cheaper than the
 * bookkeeping needed to avoid it.
 */
const bodySchema = z.object({
  id: z.number().int().positive(),
  direction: z.enum(['up', 'down']),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const { id, direction } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const rows = await db
    .select({ id: telegramChannels.id })
    .from(telegramChannels)
    .orderBy(asc(telegramChannels.sortOrder), asc(telegramChannels.id))

  const index = rows.findIndex((row) => row.id === id)
  if (index === -1) {
    throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  }

  const target = direction === 'up' ? index - 1 : index + 1
  // Already at the end of the list: the button is hidden there, but a repeated
  // click on a stale page must not be an error either.
  if (target < 0 || target >= rows.length) return {}

  const ordered = [...rows]
  const moved = ordered[index]!
  ordered[index] = ordered[target]!
  ordered[target] = moved

  for (const [position, row] of ordered.entries()) {
    await db
      .update(telegramChannels)
      .set({ sortOrder: position })
      .where(eq(telegramChannels.id, row.id))
  }

  return {}
})
