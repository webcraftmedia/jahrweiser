import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../db'
import { loginTokens, sessions, users } from '../db/schema'
import { ABSOLUTE_TTL_SECONDS, IDLE_TTL_MS } from '../helpers/sessionTtl'

const bodySchema = z.object({
  token: z.string(),
})

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
    throw createError({ statusCode: 500, message: 'Failed to establish session id' })
  }
  const expiresAt = new Date(Date.now() + IDLE_TTL_MS)
  await db
    .insert(sessions)
    .values({ id: sess.id, userUid: user.uid, expiresAt, lastSeenAt: new Date() })

  return {}
})
