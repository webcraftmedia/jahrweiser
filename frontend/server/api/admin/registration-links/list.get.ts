import { desc, eq, sql } from 'drizzle-orm'

import { useDb } from '~~/server/db'
import { registrationLinkRedemptions, registrationLinks, users } from '~~/server/db/schema'
import { linkStatus } from '~~/server/helpers/registrationLinks'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const config = useRuntimeConfig()
  const db = useDb()

  const links = await db
    .select({
      token: registrationLinks.token,
      label: registrationLinks.label,
      maxUses: registrationLinks.maxUses,
      expiresAt: registrationLinks.expiresAt,
      revokedAt: registrationLinks.revokedAt,
      createdAt: registrationLinks.createdAt,
      createdByUid: registrationLinks.createdByUid,
      createdByName: users.displayName,
      createdByEmail: users.email,
    })
    .from(registrationLinks)
    .leftJoin(users, eq(users.uid, registrationLinks.createdByUid))
    .orderBy(desc(registrationLinks.createdAt))

  // Counts in a separate grouped query, merged in JS — keeps us clear of
  // ONLY_FULL_GROUP_BY without listing every selected column in GROUP BY.
  const counts = await db
    .select({
      linkToken: registrationLinkRedemptions.linkToken,
      count: sql<string>`count(*)`,
    })
    .from(registrationLinkRedemptions)
    .groupBy(registrationLinkRedemptions.linkToken)
  const countByToken = new Map(counts.map((r) => [r.linkToken, Number(r.count)]))

  const now = Date.now()
  return links.map((l) => {
    const useCount = countByToken.get(l.token) ?? 0
    return {
      ...l,
      useCount,
      status: linkStatus(l, useCount, now),
      url: new URL(`/register/${l.token}`, config.CLIENT_URI).toString(),
    }
  })
})
