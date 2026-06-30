import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../../db'
import { users } from '../../db/schema'
import { setVCardName } from '../../helpers/contactName'
import { createCardDAVAccount, findUserByEmail, saveUser } from '../../helpers/dav'
import { ABSOLUTE_TTL_SECONDS } from '../../helpers/sessionTtl'

const bodySchema = z.object({
  // Both may be empty: saving a blank name clears the stored display name.
  firstName: z.string().trim().max(100),
  lastName: z.string().trim().max(100),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const uid = session.user.uid
  if (!uid) {
    throw createError({ statusCode: 401, statusMessage: 'No user context' })
  }
  const { firstName, lastName } = await readValidatedBody(event, bodySchema.parse)
  const config = useRuntimeConfig()
  const db = useDb()

  // Write the name to DAV (source of truth for contact data).
  const account = createCardDAVAccount(config)
  const match = await findUserByEmail(account, session.user.email)
  if (!match) {
    throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
  }
  setVCardName(match.vcard, firstName, lastName)
  // Legacy contacts may lack a UID — make sure the sidecar key is present.
  if (!match.vcard.getFirstPropertyValue('uid')?.toString().trim()) {
    match.vcard.updatePropertyWithValue('uid', uid)
  }
  await saveUser(account, match.user, match.vcard)

  // Mirror the display name into the sidecar so it's consistent without waiting
  // for the daily sync.
  const displayName = `${firstName} ${lastName}`.trim()
  await db.update(users).set({ displayName }).where(eq(users.uid, uid))

  // Refresh the session so the header reflects the new name immediately. defu
  // merges, so uid/email/role are preserved; h3 keeps the session id, leaving
  // the DB-backed session row valid.
  await setUserSession(event, { user: { name: displayName } }, { maxAge: ABSOLUTE_TTL_SECONDS })

  return { firstName, lastName, displayName }
})
