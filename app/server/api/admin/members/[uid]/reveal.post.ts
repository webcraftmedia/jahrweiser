import { eq } from 'drizzle-orm'

import { useDb } from '~~/server/db'
import { users } from '~~/server/db/schema'
import { recordEvent } from '~~/server/helpers/events'
import { requireAdmin } from '~~/server/helpers/requireAdmin'

/**
 * Hand out one member's actual address — the one deliberate exception to the
 * masking, and the reason it can stay strict everywhere else.
 *
 * Support work needs it: a typo in an address is not diagnosable from
 * `an•••@ex•••.de`, and an admin who cannot check one will ask the member to
 * read it out over the phone, which is worse for everybody.
 *
 * The price is that it is never quiet. Every reveal is written into the
 * member's own chronicle with the name of the admin who asked, which is what
 * separates "looked because there was a reason" from "browsed the directory".
 * A POST rather than a GET for the same reason: this is an act, not a read, and
 * it must not be something a link, a prefetch or a crawler can trigger.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)

  const uid = getRouterParam(event, 'uid')
  if (!uid) {
    throw createError({ statusCode: 400, statusMessage: 'Missing uid' })
  }

  const row = (
    await useDb().select({ email: users.email }).from(users).where(eq(users.uid, uid)).limit(1)
  )[0]
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }

  // Recorded before the address goes out: if the write fails the trail still
  // has the line (recordEvent fails open and logs), but the order says what we
  // intended — no reveal without a note of it.
  await recordEvent({
    type: 'admin.email_revealed',
    userUid: uid,
    actorUid: actor.uid,
    event,
  })

  return { email: row.email }
})
