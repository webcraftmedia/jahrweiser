import { randomBytes } from 'node:crypto'

import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../db'
import { loginTokens, sessions, users } from '../db/schema'

const bodySchema = z.object({
  token: z.string(),
})

export const MAX_AGE = 60 * 60 * 24 * 7

export default defineEventHandler(async (event) => {
  const { token } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const tokenRow = (
    await db
      .select()
      .from(loginTokens)
      .where(and(eq(loginTokens.token, token), isNull(loginTokens.consumedAt)))
      .limit(1)
  )[0]

  if (!tokenRow || tokenRow.expiresAt.getTime() < Date.now()) {
    throw createError({ statusCode: 401, message: 'Bad credentials' })
  }

  const user = (await db.select().from(users).where(eq(users.uid, tokenRow.userUid)).limit(1))[0]

  if (user?.deletedAt !== null || user.loginDisabled) {
    throw createError({ statusCode: 401, message: 'Bad credentials' })
  }

  await db.update(loginTokens).set({ consumedAt: new Date() }).where(eq(loginTokens.token, token))

  const sessionId = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + MAX_AGE * 1000)
  await db
    .insert(sessions)
    .values({ id: sessionId, userUid: user.uid, expiresAt, lastSeenAt: new Date() })

  await setUserSession(
    event,
    {
      sessionId,
      user: {
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        role: user.role,
      },
    },
    { maxAge: MAX_AGE },
  )

  return {}
})
