import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { users } from '~~/server/db/schema'
import { recordEvent } from '~~/server/helpers/events'
import { requireAdmin } from '~~/server/helpers/requireAdmin'

/**
 * Make somebody an admin, or stop them being one.
 *
 * `role` is MariaDB-authoritative — the DAV sync leaves it alone on update (see
 * `server/helpers/sync.ts`), which is what makes changing it here safe rather
 * than something the next sync would quietly undo. Until now it took a shell
 * and `cli:admin:grant`.
 *
 * Two refusals, both about not locking the app open or shut:
 * an admin cannot demote themselves (the obvious way to end up with no admin at
 * all), and a blocked or deleted account cannot be promoted.
 */

const bodySchema = z.object({
  role: z.enum(['user', 'admin']),
})

export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)

  const uid = getRouterParam(event, 'uid')
  if (!uid) {
    throw createError({ statusCode: 400, statusMessage: 'Missing uid' })
  }

  const { role } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const target = (await db.select().from(users).where(eq(users.uid, uid)).limit(1))[0]
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }

  if (uid === actor.uid) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot change your own role' })
  }
  if (role === 'admin' && (target.deletedAt !== null || target.loginDisabled)) {
    throw createError({ statusCode: 409, statusMessage: 'Account is blocked' })
  }

  await db.update(users).set({ role }).where(eq(users.uid, uid))

  await recordEvent({
    type: role === 'admin' ? 'admin.promoted' : 'admin.demoted',
    userUid: uid,
    actorUid: actor.uid,
    event,
  })

  return { role }
})
