import { useDb } from '../db'
import { sessions } from '../db/schema'

import { withDbTimeout } from './dbTimeout'
import { releaseLoginCooldown } from './loginCooldown'
import { ABSOLUTE_TTL_SECONDS, IDLE_TTL_MS } from './sessionTtl'

import type { User } from '../db/schema/users'

/** The request, typed without importing h3 (see server/helpers/events.ts). */
type RequestEvent = Parameters<typeof setUserSession>[0]

/**
 * Log `user` in on this request: the sealed cookie plus the `sessions` row the
 * session-check middleware validates it against. Shared by the two ways a
 * login credential is redeemed — the link and the code.
 */
export async function startUserSession(
  event: RequestEvent,
  user: Pick<User, 'uid' | 'displayName' | 'email' | 'role'>,
): Promise<void> {
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
    // No event for this one: it is a fault in our own session handling, not
    // something that happened to the member, and the 500 it throws is logged
    // with its stack by Nitro.
    throw createError({ statusCode: 500, message: 'Failed to establish session id' })
  }
  const expiresAt = new Date(Date.now() + IDLE_TTL_MS)
  await withDbTimeout(
    useDb()
      .insert(sessions)
      .values({ id: sess.id, userUid: user.uid, expiresAt, lastSeenAt: new Date() }),
  )

  // The cooldown keeps an unused link from being buried under new mails. Once
  // one was redeemed there is nothing left to wait for: somebody who logs out
  // and asks again a minute later would otherwise be sent back to a link that
  // is spent. No leak either — redeeming proved access to the mailbox.
  releaseLoginCooldown(user.email.toLowerCase())
}
