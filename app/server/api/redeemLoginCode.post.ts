import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../db'
import { loginTokens, users } from '../db/schema'
import { withDbTimeout } from '../helpers/dbTimeout'
import { recordEvent } from '../helpers/events'
import {
  LOGIN_CODE_LENGTH,
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_MAX_DAILY_FAILURES,
  LOGIN_CODE_TTL_MS,
  clearLoginCodeBinding,
  codeHashOf,
  codeKeyOf,
  readLoginCodeNonce,
} from '../helpers/loginCode'
import { startUserSession } from '../helpers/loginSession'

import type { RedeemCodeFailure } from './redeemLoginLink.post'
import type { UserEventType } from '../helpers/events'

const bodySchema = z.object({
  code: z.string().length(LOGIN_CODE_LENGTH).regex(/^\d+$/),
})

const DAY_MS = 24 * 60 * 60 * 1000

/** Spelled out for the same reason as `REDEEM_EVENT` in redeemLoginLink.post.ts. */
const REDEEM_EVENT: Record<RedeemCodeFailure, UserEventType> = {
  unknown: 'auth.redeem_unknown',
  used: 'auth.redeem_used',
  expired: 'auth.redeem_expired',
  disabled: 'auth.redeem_disabled',
  wrong: 'auth.redeem_wrong',
  locked: 'auth.redeem_locked',
}

/**
 * Redeem the login code from the mail — the typed twin of redeemLoginLink.
 * Why it exists and what keeps six digits safe: server/helpers/loginCode.ts.
 */
export default defineEventHandler(async (event) => {
  const { code } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  async function refuse(
    reason: RedeemCodeFailure,
    userUid?: string,
    extra: Record<string, unknown> = {},
  ) {
    await recordEvent({ type: REDEEM_EVENT[reason], userUid, meta: { via: 'code' }, event })
    return createError({
      statusCode: 401,
      message: 'Bad credentials',
      data: { reason, ...extra },
    })
  }

  // No cookie means this browser never asked for a code — or asked longer ago
  // than the code lives, which the cookie's own lifetime mirrors.
  const nonce = readLoginCodeNonce(event)
  if (!nonce) throw await refuse('unknown')

  const row = (
    await withDbTimeout(
      db
        .select()
        .from(loginTokens)
        .where(eq(loginTokens.codeKey, codeKeyOf(nonce)))
        .limit(1),
    )
  )[0]

  if (!row) throw await refuse('unknown')
  if (row.consumedAt !== null) throw await refuse('used', row.userUid)
  if (
    row.expiresAt.getTime() < Date.now() ||
    row.requestedAt.getTime() + LOGIN_CODE_TTL_MS < Date.now()
  ) {
    throw await refuse('expired', row.userUid)
  }

  // The member's budget across all their codes. Codes that logged somebody in
  // are left out, so only guesses that went nowhere count against it.
  const spent = (
    await withDbTimeout(
      db
        .select({ attempts: sql<string | null>`sum(${loginTokens.codeAttempts})` })
        .from(loginTokens)
        .where(
          and(
            eq(loginTokens.userUid, row.userUid),
            isNull(loginTokens.consumedAt),
            gt(loginTokens.requestedAt, new Date(Date.now() - DAY_MS)),
          ),
        ),
    )
  )[0]
  if (Number(spent?.attempts ?? 0) >= LOGIN_CODE_MAX_DAILY_FAILURES) {
    throw await refuse('locked', row.userUid)
  }

  // Claim the attempt before comparing, in one conditional UPDATE: read, check
  // and write as three steps would let a burst of parallel requests all see
  // "0 attempts used" and guess far past the limit.
  const claimed = await withDbTimeout(
    db
      .update(loginTokens)
      .set({ codeAttempts: sql`${loginTokens.codeAttempts} + 1` })
      .where(
        and(
          eq(loginTokens.token, row.token),
          lt(loginTokens.codeAttempts, LOGIN_CODE_MAX_ATTEMPTS),
        ),
      ),
  )
  if (claimed[0].affectedRows === 0) throw await refuse('locked', row.userUid)

  if (row.codeHash !== codeHashOf(nonce, code)) {
    const attemptsLeft = Math.max(0, LOGIN_CODE_MAX_ATTEMPTS - row.codeAttempts - 1)
    throw await refuse('wrong', row.userUid, { attemptsLeft })
  }

  const user = (
    await withDbTimeout(db.select().from(users).where(eq(users.uid, row.userUid)).limit(1))
  )[0]

  if (user?.deletedAt !== null || user.loginDisabled) {
    throw await refuse('disabled', row.userUid)
  }

  // Conditional for the same reason as the claim above: the link from the
  // same mail may be redeemed in this very moment, and only one of the two may
  // win.
  const consumed = await withDbTimeout(
    db
      .update(loginTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(loginTokens.token, row.token), isNull(loginTokens.consumedAt))),
  )
  if (consumed[0].affectedRows === 0) throw await refuse('used', row.userUid)

  await startUserSession(event, user)
  clearLoginCodeBinding(event)

  // Written last, as in redeemLoginLink: "ok" means the session row exists.
  await recordEvent({
    type: 'auth.redeem_ok',
    userUid: user.uid,
    meta: { via: 'code' },
    event,
  })

  return {}
})
