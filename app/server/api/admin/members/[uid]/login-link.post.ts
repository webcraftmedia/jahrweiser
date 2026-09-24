import { eq } from 'drizzle-orm'

import { useDb } from '~~/server/db'
import { users } from '~~/server/db/schema'
import { recordEvent } from '~~/server/helpers/events'
import { sendLoginLink } from '~~/server/helpers/loginLink'
import { requireAdmin } from '~~/server/helpers/requireAdmin'

/**
 * Send a member a fresh login link, on their behalf.
 *
 * The support answer to "I never get the mail": the admin triggers it while on
 * the phone with them, and the chronicle then shows — for the first time —
 * whether the mail actually left the building (`auth.mail_sent`) or not
 * (`auth.mail_failed`).
 *
 * Deliberately bypasses the per-address cooldown that `requestLoginLink`
 * enforces: that gate exists to stop somebody hammering the form, and an admin
 * doing this once, recorded by name, is the case it is not meant to catch. The
 * address itself never passes through the browser — the admin has a uid, the
 * server has the address.
 *
 * Refused for blocked or deleted accounts: sending a working key to an account
 * that is supposed to be shut is precisely what the block is for.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)

  const uid = getRouterParam(event, 'uid')
  if (!uid) {
    throw createError({ statusCode: 400, statusMessage: 'Missing uid' })
  }

  const config = useRuntimeConfig()
  const db = useDb()

  const user = (await db.select().from(users).where(eq(users.uid, uid)).limit(1))[0]
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }
  if (user.deletedAt !== null || user.loginDisabled) {
    throw createError({ statusCode: 409, statusMessage: 'Account is blocked' })
  }

  // Recorded before the send, so that a mail which throws still leaves the
  // admin's intent in the trail — `sendLoginLink` writes the outcome itself.
  await recordEvent({
    type: 'admin.login_link_sent',
    userUid: uid,
    actorUid: actor.uid,
    event,
  })

  await sendLoginLink(config, user)

  return { sent: true }
})
