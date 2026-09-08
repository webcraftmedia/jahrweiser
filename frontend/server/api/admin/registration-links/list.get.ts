import { desc, eq } from 'drizzle-orm'

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
      calendars: registrationLinks.calendars,
    })
    .from(registrationLinks)
    .leftJoin(users, eq(users.uid, registrationLinks.createdByUid))
    .orderBy(desc(registrationLinks.createdAt))

  // One row per join, aggregated in JS. No GROUP BY, so ONLY_FULL_GROUP_BY
  // cannot bite, and both numbers below come from the same consistent read.
  //
  // The count alone could be a cheaper COUNT(*), but the second number needs the
  // individual rows anyway: since the binding stays editable, a link's current
  // `calendars` says nothing about what earlier joins received - only the
  // per-redemption snapshot does. `divergentUseCount` reports how many joins got
  // something other than today's binding, so an admin never reads "5 Beitritte,
  // Kalender: Herbstfest" as "all five got Herbstfest".
  const redemptions = await db
    .select({
      linkToken: registrationLinkRedemptions.linkToken,
      grantedCalendars: registrationLinkRedemptions.grantedCalendars,
    })
    .from(registrationLinkRedemptions)

  /** Order-independent identity of a calendar set; '' means "granted nothing". */
  const fingerprint = (calendars: string[] | null): string =>
    calendars?.length ? [...calendars].sort().join(' ') : ''

  const grantsByToken = new Map<string, string[]>()
  for (const redemption of redemptions) {
    const grants = grantsByToken.get(redemption.linkToken) ?? []
    grants.push(fingerprint(redemption.grantedCalendars))
    grantsByToken.set(redemption.linkToken, grants)
  }

  const now = Date.now()
  return links.map((l) => {
    const grants = grantsByToken.get(l.token) ?? []
    const current = fingerprint(l.calendars)
    const useCount = grants.length
    return {
      ...l,
      useCount,
      divergentUseCount: grants.filter((grant) => grant !== current).length,
      status: linkStatus(l, useCount, now),
      url: new URL(`/register/${l.token}`, config.CLIENT_URI).toString(),
    }
  })
})
