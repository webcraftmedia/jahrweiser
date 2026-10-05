import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../db'
import { loginTokens, users } from '../db/schema'
import { withDbTimeout } from '../helpers/dbTimeout'
import { recordEvent } from '../helpers/events'
import { startUserSession } from '../helpers/loginSession'

import type { UserEventType } from '../helpers/events'

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
 * The code adds two refusals the link cannot have: a wrong guess, and no
 * guesses left — see server/api/redeemLoginCode.post.ts.
 */
export type RedeemCodeFailure = RedeemFailure | 'wrong' | 'locked'

/**
 * Spelled out rather than built from the reason, so that adding a refusal
 * cannot quietly start writing an event type nobody declared.
 *
 * These rows replace the `[auth] redeem …` console lines this endpoint used to
 * write: same facts, but attributable to a member, queryable per member, and
 * subject to a retention horizon — none of which a rotating log file offers.
 */
const REDEEM_EVENT: Record<RedeemFailure, UserEventType> = {
  unknown: 'auth.redeem_unknown',
  used: 'auth.redeem_used',
  expired: 'auth.redeem_expired',
  disabled: 'auth.redeem_disabled',
}

export default defineEventHandler(async (event) => {
  const { token } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  /**
   * Refuse, and leave a trace of it. The trace is the reason this endpoint can
   * be diagnosed at all: "already used" and "expired" look identical from the
   * member's side of a support call, and the difference decides whether they
   * need a new link or a word with their Obmann.
   *
   * Returns the error rather than throwing it, so the call site keeps its
   * `throw` and TypeScript keeps narrowing what comes after.
   */
  async function refuse(reason: RedeemFailure, userUid?: string) {
    await recordEvent({ type: REDEEM_EVENT[reason], userUid, event })
    return createError({ statusCode: 401, message: 'Bad credentials', data: { reason } })
  }

  // Consumed rows are selected too, so "already used" stays distinguishable
  // from "never existed".
  const tokenRow = (
    await withDbTimeout(db.select().from(loginTokens).where(eq(loginTokens.token, token)).limit(1))
  )[0]

  if (!tokenRow) throw await refuse('unknown')
  if (tokenRow.consumedAt !== null) throw await refuse('used', tokenRow.userUid)
  if (tokenRow.expiresAt.getTime() < Date.now()) throw await refuse('expired', tokenRow.userUid)

  const user = (
    await withDbTimeout(db.select().from(users).where(eq(users.uid, tokenRow.userUid)).limit(1))
  )[0]

  if (user?.deletedAt !== null || user.loginDisabled) {
    throw await refuse('disabled', tokenRow.userUid)
  }

  // Conditional, so that only one of the link and the code from the same mail
  // can win when both are redeemed at the same moment.
  const consumed = await withDbTimeout(
    db
      .update(loginTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(loginTokens.token, token), isNull(loginTokens.consumedAt))),
  )
  if (consumed[0].affectedRows === 0) throw await refuse('used', tokenRow.userUid)

  await startUserSession(event, user)

  // Written last, so "ok" in the trail means the session row exists. A member
  // who reports a failed login *after* this point is telling us about their
  // browser, not about us — see the `nosession` branch in
  // src/pages/login/[token].vue.
  await recordEvent({ type: 'auth.redeem_ok', userUid: user.uid, event })

  return {}
})
