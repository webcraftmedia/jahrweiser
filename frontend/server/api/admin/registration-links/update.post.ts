import { eq } from 'drizzle-orm'
import { z } from 'zod'

import type { LinkDuration } from '~~/server/helpers/registrationLinks'

import { useDb } from '~~/server/db'
import { registrationLinks } from '~~/server/db/schema'
import { computeExpiresAt, LINK_DURATION_KEYS } from '~~/server/helpers/registrationLinks'

// Edit an existing link's label and/or validity. `label` is always applied
// (empty clears it); `duration`, when present, re-bases the expiry to that
// preset from now (`unlimited` clears it).
const bodySchema = z.object({
  token: z.string(),
  label: z.string().trim().max(255),
  duration: z.enum(LINK_DURATION_KEYS as [LinkDuration, ...LinkDuration[]]).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const { token, label, duration } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const updates: { label: string | null; expiresAt?: Date | null } = { label: label || null }
  if (duration !== undefined) {
    updates.expiresAt = computeExpiresAt(duration, Date.now())
  }

  await db.update(registrationLinks).set(updates).where(eq(registrationLinks.token, token))
  return {}
})
