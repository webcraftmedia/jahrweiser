import { eq, sql } from 'drizzle-orm'

import { useDb } from '~~/server/db'
import { registrationLinkRedemptions, registrationLinks } from '~~/server/db/schema'
import { linkStatus } from '~~/server/helpers/registrationLinks'

// Public, unauthenticated: lets the registration page decide whether to render
// the form or a friendly "this link is no longer valid" message. Returns only
// the coarse status — never the creator or join count — to avoid leaking
// admin/internal data to anonymous holders of the token.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) {
    return { status: 'notfound' as const }
  }
  const db = useDb()

  const link = (
    await db.select().from(registrationLinks).where(eq(registrationLinks.token, token)).limit(1)
  )[0]
  if (!link) {
    return { status: 'notfound' as const }
  }

  const useCount = Number(
    (
      await db
        .select({ count: sql<string>`count(*)` })
        .from(registrationLinkRedemptions)
        .where(eq(registrationLinkRedemptions.linkToken, token))
    )[0]?.count ?? 0,
  )

  return { status: linkStatus(link, useCount, Date.now()) }
})
