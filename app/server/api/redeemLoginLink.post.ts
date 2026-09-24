import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../db'
import { loginTokens, sessions, users } from '../db/schema'
import { withDbTimeout } from '../helpers/dbTimeout'
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

/**
 * One line per redemption, because the last time a member could not log in
 * there was nothing in the log to tell "the link was already spent" from "the
 * request never arrived" — and the difference decides whether the problem is
 * ours or theirs.
 *
 * The user's UID and nothing else: no token (a live credential), no address.
 * The UID is the DAV identifier, which is pseudonymous and already the key of
 * every other row we keep about that member.
 */
function logRedeem(outcome: string, userUid?: string) {
  // `warn` rather than `info`: the lint rule allows only warn/error, and the
  // codebase already uses warn for audit lines of this kind (see the Telegram
  // and Blättchen deletions).
  console.warn(`[auth] redeem ${outcome}${userUid ? ` uid=${userUid}` : ''}`)
}

function badLink(reason: RedeemFailure, userUid?: string) {
  logRedeem(reason, userUid)
  return createError({ statusCode: 401, message: 'Bad credentials', data: { reason } })
}

export default defineEventHandler(async (event) => {
  const { token } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  // Consumed rows are selected too, so "already used" stays distinguishable
  // from "never existed".
  const tokenRow = (
    await withDbTimeout(db.select().from(loginTokens).where(eq(loginTokens.token, token)).limit(1))
  )[0]

  if (!tokenRow) throw badLink('unknown')
  if (tokenRow.consumedAt !== null) throw badLink('used', tokenRow.userUid)
  if (tokenRow.expiresAt.getTime() < Date.now()) throw badLink('expired', tokenRow.userUid)

  const user = (
    await withDbTimeout(db.select().from(users).where(eq(users.uid, tokenRow.userUid)).limit(1))
  )[0]

  if (user?.deletedAt !== null || user.loginDisabled) {
    throw badLink('disabled', tokenRow.userUid)
  }

  await withDbTimeout(
    db.update(loginTokens).set({ consumedAt: new Date() }).where(eq(loginTokens.token, token)),
  )

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
    logRedeem('no-session-id', user.uid)
    throw createError({ statusCode: 500, message: 'Failed to establish session id' })
  }
  const expiresAt = new Date(Date.now() + IDLE_TTL_MS)
  await withDbTimeout(
    db
      .insert(sessions)
      .values({ id: sess.id, userUid: user.uid, expiresAt, lastSeenAt: new Date() }),
  )

  // Logged on the way out, so "ok" in the log means the session row exists.
  // A member reporting a failed login *after* this line points at the cookie,
  // not at us — see the `nosession` branch in src/pages/login/[token].vue.
  logRedeem('ok', user.uid)
  return {}
})
