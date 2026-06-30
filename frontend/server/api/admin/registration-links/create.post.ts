import { randomBytes } from 'node:crypto'

import { z } from 'zod'

import type { LinkDuration } from '~~/server/helpers/registrationLinks'

import { useDb } from '~~/server/db'
import { registrationLinks } from '~~/server/db/schema'
import { computeExpiresAt, LINK_DURATION_KEYS } from '~~/server/helpers/registrationLinks'

const bodySchema = z.object({
  label: z.string().trim().max(255).optional(),
  duration: z.enum(LINK_DURATION_KEYS as [LinkDuration, ...LinkDuration[]]),
  maxUses: z.number().int().positive().max(100000).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not Authorized' })
  }

  const { label, duration, maxUses } = await readValidatedBody(event, bodySchema.parse)
  const config = useRuntimeConfig()
  const db = useDb()

  const token = randomBytes(32).toString('hex')
  const expiresAt = computeExpiresAt(duration, Date.now())

  await db.insert(registrationLinks).values({
    token,
    createdByUid: session.user.uid,
    label: label || null,
    maxUses: maxUses ?? null,
    expiresAt,
  })

  const url = new URL(`/register/${token}`, config.CLIENT_URI).toString()
  return { token, url, label: label || null, expiresAt, maxUses: maxUses ?? null }
})
