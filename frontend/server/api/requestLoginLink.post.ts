import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../db'
import { loginTokens, userTags, users } from '../db/schema'
import { createCardDAVAccount, findUserByEmail } from '../helpers/dav'
import { sendLoginLink } from '../helpers/loginLink'
import { isEmailNotFound, markEmailNotFound } from '../helpers/negativeCache'
import { extractUserFromVCardData } from '../helpers/sync'

const bodySchema = z.object({
  email: z.email(),
  redirect: z.string().startsWith('/').optional(),
})

export default defineEventHandler(async (event) => {
  const { email, redirect } = await readValidatedBody(event, bodySchema.parse)
  const config = useRuntimeConfig()
  const db = useDb()
  const normalizedEmail = email.toLowerCase()

  if (isEmailNotFound(normalizedEmail)) {
    return {}
  }

  let userRow = (await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1))[0]

  // Lazy-fallback: ask DAV directly if not in sidecar yet
  if (!userRow) {
    const davAccount = createCardDAVAccount(config)
    const davMatch = await findUserByEmail(davAccount, normalizedEmail)
    if (!davMatch) {
      markEmailNotFound(normalizedEmail)
      return {}
    }
    const snap = extractUserFromVCardData(davMatch.vcard.toString())
    if (snap?.email !== normalizedEmail) {
      markEmailNotFound(normalizedEmail)
      return {}
    }
    await db
      .insert(users)
      .values({
        uid: snap.uid,
        email: snap.email,
        displayName: snap.displayName,
        role: snap.role,
      })
      .onDuplicateKeyUpdate({
        set: {
          email: snap.email,
          displayName: snap.displayName,
          role: snap.role,
          deletedAt: null,
        },
      })
    if (snap.tags.length > 0) {
      await db
        .insert(userTags)
        .values(snap.tags.map((tag) => ({ userUid: snap.uid, tag })))
        .onDuplicateKeyUpdate({ set: { tag: snap.tags[0]! } })
    }
    userRow = (await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1))[0]
  }

  if (userRow?.deletedAt !== null || userRow.loginDisabled) {
    return {}
  }

  const recentToken = (
    await db
      .select({ requestedAt: loginTokens.requestedAt })
      .from(loginTokens)
      .where(eq(loginTokens.userUid, userRow.uid))
      .orderBy(desc(loginTokens.requestedAt))
      .limit(1)
  )[0]

  if (
    config.LOGIN_RATE_LIMIT_MS > 0 &&
    recentToken &&
    Date.now() - recentToken.requestedAt.getTime() < config.LOGIN_RATE_LIMIT_MS
  ) {
    return {}
  }

  await sendLoginLink(config, userRow, redirect)

  return {}
})
