import path from 'node:path'

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '~~/server/db'
import { users } from '~~/server/db/schema'
import { defaultParams, emailRenderer } from '~~/server/helpers/email'
import { recordEvent } from '~~/server/helpers/events'
import { applyTagChanges } from '~~/server/helpers/userTags'

const bodySchema = z.object({
  email: z.email(),
  tags: z.array(z.object({ name: z.string(), state: z.boolean() })),
  sendMail: z.boolean(),
})

const config = useRuntimeConfig()

export default defineEventHandler(async (event) => {
  // make sure the user is logged in
  // This will throw a 401 error if the request doesn't come from a valid user session
  const session = await requireUserSession(event)

  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const { email, tags, sendMail } = await readValidatedBody(event, bodySchema.parse)

  // The DAV work itself lives in the helper, which the uid-keyed route in the
  // members' area uses too — one implementation, two ways in.
  const { newTags, created } = await applyTagChanges(config, session.user.email, email, tags)

  // Attributed to both sides: which admin handed out which calendars, and to
  // whom. The target may not be in the sidecar yet — this endpoint can create a
  // contact that the next sync will mirror — so a missing uid is recorded as
  // missing rather than as nobody's doing.
  const targetUid =
    (await useDb().select({ uid: users.uid }).from(users).where(eq(users.email, email)).limit(1))[0]
      ?.uid ?? null
  await recordEvent({
    type: 'admin.tags_changed',
    userUid: targetUid,
    actorUid: session.user.uid,
    meta: { granted: newTags, calendars: tags.filter((t) => t.state).map((t) => t.name) },
    event,
  })

  // sendMail if selected and at least one new tag is set
  if (sendMail && newTags.length > 0) {
    const to = { address: email, name: '' }
    const adminName = session.user.name
      ? session.user.name.split(' ').slice(-1).pop()
      : session.user.email
    try {
      await emailRenderer.send({
        template: path.join(process.cwd(), 'server/emails/welcome'),
        message: {
          to,
        },
        locals: {
          ...defaultParams,
          locale: 'de',
          newUser: created,
          tags: newTags,
          adminName,
        },
      })
    } catch {
      throw createError({ statusCode: 500, statusMessage: 'Failed to send email' })
    }
    return true
  }
  return false
})
