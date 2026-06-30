import { eq, sql } from 'drizzle-orm'

import { useDb } from '~~/server/db'
import { registrationLinkRedemptions, registrationLinks, users } from '~~/server/db/schema'
import { linkStatus } from '~~/server/helpers/registrationLinks'

// Public, unauthenticated: lets the registration page decide whether to render
// the form or a friendly "this link is no longer valid" message, and who the
// invitee was invited by. Returns only the coarse status and the inviter's
// display name (the point of an invitation) — never the join count or other
// internal state — to limit what an anonymous token holder learns.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) {
    return { status: 'notfound' as const, invitedBy: null }
  }
  const db = useDb()

  const row = (
    await db
      .select({ link: registrationLinks, invitedBy: users.displayName })
      .from(registrationLinks)
      .leftJoin(users, eq(users.uid, registrationLinks.createdByUid))
      .where(eq(registrationLinks.token, token))
      .limit(1)
  )[0]
  if (!row) {
    return { status: 'notfound' as const, invitedBy: null }
  }

  const useCount = Number(
    (
      await db
        .select({ count: sql<string>`count(*)` })
        .from(registrationLinkRedemptions)
        .where(eq(registrationLinkRedemptions.linkToken, token))
    )[0]?.count ?? 0,
  )

  return { status: linkStatus(row.link, useCount, Date.now()), invitedBy: row.invitedBy }
})
