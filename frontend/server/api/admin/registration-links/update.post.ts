import { eq } from 'drizzle-orm'
import { z } from 'zod'

import type { LinkDuration } from '~~/server/helpers/registrationLinks'

import { useDb } from '~~/server/db'
import { registrationLinks } from '~~/server/db/schema'
import {
  assertLinkOwner,
  computeExpiresAt,
  findGrantableCalendars,
  LINK_DURATION_KEYS,
  narrowCalendarBinding,
} from '~~/server/helpers/registrationLinks'

// Edit an existing link's label, validity and/or calendar binding. `label` is
// always applied (empty clears it); `duration`, when present, re-bases the
// expiry to that preset from now (`unlimited` clears it); `calendars`, when
// present, replaces the binding (empty clears it).
//
// Changing the binding is safe at any time because it is not what past joins
// received — each redemption snapshots its own grant in
// `registration_link_redemptions.granted_calendars`. Editing therefore only
// steers future redemptions and never rewrites history.
const bodySchema = z.object({
  token: z.string(),
  label: z.string().trim().max(255),
  duration: z.enum(LINK_DURATION_KEYS as [LinkDuration, ...LinkDuration[]]).optional(),
  calendars: z.array(z.string()).max(100).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const { token, label, duration, calendars } = await readValidatedBody(event, bodySchema.parse)
  const config = useRuntimeConfig()
  const db = useDb()

  // Editing is owner-only — every admin may view and deactivate, but only the
  // creator may change a link's label or validity.
  const link = (
    await db
      .select({ createdByUid: registrationLinks.createdByUid })
      .from(registrationLinks)
      .where(eq(registrationLinks.token, token))
      .limit(1)
  )[0]
  assertLinkOwner(link?.createdByUid, session.user.uid)

  const updates: {
    label: string | null
    expiresAt?: Date | null
    calendars?: string[] | null
  } = { label: label || null }
  if (duration !== undefined) {
    updates.expiresAt = computeExpiresAt(duration, Date.now())
  }
  if (calendars !== undefined) {
    updates.calendars = calendars.length
      ? narrowCalendarBinding(calendars, await findGrantableCalendars(config, session.user.email))
      : null
  }

  await db.update(registrationLinks).set(updates).where(eq(registrationLinks.token, token))
  return {}
})
