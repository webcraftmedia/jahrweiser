import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../db'
import { loginTokens, sessions, users } from '../db/schema'
import { ABSOLUTE_TTL_SECONDS, IDLE_TTL_MS } from '../helpers/sessionTtl'

const bodySchema = z.object({
  token: z.string(),
})

/**
 * Why a link cannot be redeemed. The client turns this into a sentence that
 * tells somebody what to do next — "already used" and "expired" call for
 * different reactions, and collapsing them into one message is what let a mail
 * scanner eat a member's links for three months without anyone noticing.
 *
 * Not an enumeration risk: to see any of these you must already hold a
 * 256-bit token, which tells you more than the reason ever could.
 */
export type RedeemFailure = 'unknown' | 'used' | 'expired' | 'disabled'

function badLink(reason: RedeemFailure) {
  return createError({ statusCode: 401, message: 'Bad credentials', data: { reason } })
}

export default defineEventHandler(async (event) => {
  const { token } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  // Consumed rows are selected too, so "already used" stays distinguishable
  // from "never existed".
  const tokenRow = (
    await db.select().from(loginTokens).where(eq(loginTokens.token, token)).limit(1)
  )[0]

  if (!tokenRow) throw badLink('unknown')
  if (tokenRow.consumedAt !== null) throw badLink('used')
  if (tokenRow.expiresAt.getTime() < Date.now()) throw badLink('expired')

  const user = (await db.select().from(users).where(eq(users.uid, tokenRow.userUid)).limit(1))[0]

  if (user?.deletedAt !== null || user.loginDisabled) {
    throw badLink('disabled')
  }

  await db.update(loginTokens).set({ consumedAt: new Date() }).where(eq(loginTokens.token, token))

  // nuxt-auth-utils auto-generates a top-level `id` for the session and
  // ignores any `id` we pass in. So: write the cookie first, then read back
  // the generated id and use it as the PK of our sessions table — that way
  // the middleware can look the row up from the cookie alone.
  await setUserSession(
    event,
    {
      user: {
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        role: user.role,
      },
    },
    // Cookie/seal lives up to the absolute cap; the real validity gate is the
    // DB `expiresAt`, which the session-check middleware slides on activity.
    { maxAge: ABSOLUTE_TTL_SECONDS },
  )

  const sess = (await getUserSession(event)) as { id?: string }
  if (!sess.id) {
    throw createError({ statusCode: 500, message: 'Failed to establish session id' })
  }
  const expiresAt = new Date(Date.now() + IDLE_TTL_MS)
  await db
    .insert(sessions)
    .values({ id: sess.id, userUid: user.uid, expiresAt, lastSeenAt: new Date() })

  return {}
})
