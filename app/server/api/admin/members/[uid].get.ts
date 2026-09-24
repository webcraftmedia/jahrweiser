import { desc, eq } from 'drizzle-orm'

import { useDb } from '~~/server/db'
import { sessions, users } from '~~/server/db/schema'
import { requireAdmin } from '~~/server/helpers/requireAdmin'
import { abbreviateName, maskEmail } from '~~/shared/mask'

/**
 * One member, as much as the detail page may know about them.
 *
 * Still masked: opening somebody's page is not a reason to hand out their
 * address. That takes the deliberate, recorded step in `[uid]/reveal.post.ts`.
 *
 * The sessions come with it because "who is still logged in as this person"
 * and "should I end that" are the same thought — and because a revoked or
 * expired row is the evidence behind a member's "I was suddenly logged out".
 */

export interface MemberSession {
  /** First characters only — enough to tell two rows apart, and no more. */
  id: string
  createdAt: string | null
  expiresAt: string | null
  lastSeenAt: string | null
  revokedAt: string | null
  /** Whether it would still let somebody in right now. */
  active: boolean
}

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString()
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const uid = getRouterParam(event, 'uid')
  if (!uid) {
    throw createError({ statusCode: 400, statusMessage: 'Missing uid' })
  }

  const db = useDb()
  const user = (await db.select().from(users).where(eq(users.uid, uid)).limit(1))[0]
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }

  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userUid, uid))
    .orderBy(desc(sessions.createdAt))
    .limit(50)

  const now = Date.now()

  return {
    uid: user.uid,
    name: abbreviateName(user.displayName),
    email: maskEmail(user.email),
    role: user.role,
    status: user.deletedAt !== null ? 'deleted' : user.loginDisabled ? 'blocked' : 'active',
    newsletter: user.newsletterSubscribed,
    postalCode: user.postalCode,
    createdAt: iso(user.createdAt),
    deletedAt: iso(user.deletedAt),
    sessions: rows.map(
      (row): MemberSession => ({
        id: row.id.slice(0, 8),
        createdAt: iso(row.createdAt),
        expiresAt: iso(row.expiresAt),
        lastSeenAt: iso(row.lastSeenAt),
        revokedAt: iso(row.revokedAt),
        active: row.revokedAt === null && row.expiresAt.getTime() > now,
      }),
    ),
  }
})
