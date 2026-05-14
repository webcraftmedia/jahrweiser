import { randomBytes } from 'node:crypto'
import path from 'node:path'

import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../db'
import { loginTokens, userTags, users } from '../db/schema'
import { createCardDAVAccount, findUserByEmail } from '../helpers/dav'
import { defaultParams, emailRenderer } from '../helpers/email'
import { extractUserFromVCardData } from '../helpers/sync'

const REQUEST_RATE_LIMIT_MS = 60_000
const TOKEN_TTL_MS = 30 * 60 * 1000
const NEGATIVE_CACHE_TTL_MS = 60 * 60 * 1000

const bodySchema = z.object({
  email: z.email(),
  redirect: z.string().startsWith('/').optional(),
})

// In-process negative cache for non-existent emails. Cleared on restart.
const negativeCache = new Map<string, number>()

function negativeCacheHit(email: string): boolean {
  const ts = negativeCache.get(email)
  if (!ts) return false
  if (Date.now() - ts > NEGATIVE_CACHE_TTL_MS) {
    negativeCache.delete(email)
    return false
  }
  return true
}

export default defineEventHandler(async (event) => {
  const { email, redirect } = await readValidatedBody(event, bodySchema.parse)
  const config = useRuntimeConfig()
  const db = useDb()
  const normalizedEmail = email.toLowerCase()

  if (negativeCacheHit(normalizedEmail)) {
    return {}
  }

  let userRow = (await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1))[0]

  // Lazy-fallback: ask DAV directly if not in sidecar yet
  if (!userRow) {
    const davAccount = createCardDAVAccount(config)
    const davMatch = await findUserByEmail(davAccount, normalizedEmail)
    if (!davMatch) {
      negativeCache.set(normalizedEmail, Date.now())
      return {}
    }
    const snap = extractUserFromVCardData(davMatch.vcard.toString())
    if (snap?.email !== normalizedEmail) {
      negativeCache.set(normalizedEmail, Date.now())
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

  if (recentToken && Date.now() - recentToken.requestedAt.getTime() < REQUEST_RATE_LIMIT_MS) {
    return {}
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
  await db.insert(loginTokens).values({ token, userUid: userRow.uid, expiresAt })

  const to = { address: userRow.email, name: userRow.displayName ?? '' }
  try {
    await emailRenderer.send({
      template: path.join(process.cwd(), 'server/emails/requestLoginLink'),
      message: { to },
      locals: {
        ...defaultParams,
        locale: 'de',
        name: userRow.displayName,
        authURL: (() => {
          const url = new URL(`/login/${token}`, config.CLIENT_URI)
          if (redirect) url.searchParams.set('redirect', redirect)
          return url
        })(),
      },
    })
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Failed to send login email' })
  }

  return {}
})
