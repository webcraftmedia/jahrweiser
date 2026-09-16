import { randomBytes } from 'node:crypto'

import { z } from 'zod'

import type { LinkDuration } from '~~/server/helpers/registrationLinks'

import { useDb } from '~~/server/db'
import { registrationLinks } from '~~/server/db/schema'
import {
  computeExpiresAt,
  findGrantableCalendars,
  LINK_DURATION_KEYS,
  narrowCalendarBinding,
} from '~~/server/helpers/registrationLinks'

const bodySchema = z.object({
  label: z.string().trim().max(255).optional(),
  duration: z.enum(LINK_DURATION_KEYS as [LinkDuration, ...LinkDuration[]]),
  maxUses: z.number().int().positive().max(100000).optional(),
  // Calendar names the link grants private access to. Omitted or empty = no
  // binding. Filtered server-side against the creator's own X-ADMIN-TAGS.
  calendars: z.array(z.string()).max(100).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const { label, duration, maxUses, calendars } = await readValidatedBody(event, bodySchema.parse)
  const config = useRuntimeConfig()
  const db = useDb()

  // A link must not be able to grant what its creator cannot grant directly.
  const binding = calendars?.length
    ? narrowCalendarBinding(calendars, await findGrantableCalendars(config, session.user.email))
    : null

  const token = randomBytes(32).toString('hex')
  const expiresAt = computeExpiresAt(duration, Date.now())

  await db.insert(registrationLinks).values({
    token,
    createdByUid: session.user.uid,
    label: label || null,
    maxUses: maxUses ?? null,
    expiresAt,
    calendars: binding,
  })

  const url = new URL(`/register/${token}`, config.CLIENT_URI).toString()
  return {
    token,
    url,
    label: label || null,
    expiresAt,
    maxUses: maxUses ?? null,
    calendars: binding,
  }
})
