import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../db'
import { registrationLinkRedemptions, registrationLinks, users } from '../db/schema'
import { createCardDAVAccount, createUser, findUserByEmail, saveUser } from '../helpers/dav'
import { sendLoginLink } from '../helpers/loginLink'
import { clearEmailNotFound } from '../helpers/negativeCache'
import {
  buildRegistrantVCard,
  fillMissingRegistrantData,
  linkStatus,
} from '../helpers/registrationLinks'
import { extractUserFromVCardData } from '../helpers/sync'

const bodySchema = z.object({
  token: z.string(),
  email: z.email(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
})

export default defineEventHandler(async (event) => {
  const { token, email, firstName, lastName } = await readValidatedBody(event, bodySchema.parse)
  const config = useRuntimeConfig()
  const db = useDb()
  const normalizedEmail = email.toLowerCase()

  // 1. The link must still be usable.
  const link = (
    await db.select().from(registrationLinks).where(eq(registrationLinks.token, token)).limit(1)
  )[0]
  if (!link) {
    throw createError({ statusCode: 404, statusMessage: 'Link not found' })
  }
  const useCount = Number(
    (
      await db
        .select({ count: sql<string>`count(*)` })
        .from(registrationLinkRedemptions)
        .where(eq(registrationLinkRedemptions.linkToken, token))
    )[0]?.count ?? 0,
  )
  const status = linkStatus(link, useCount, Date.now())
  if (status !== 'valid') {
    throw createError({ statusCode: 410, statusMessage: `Link ${status}` })
  }

  // 2. Existing account? DAV is the source of truth for contact data, so an
  // address already there (or mirrored into the sidecar) belongs to someone who
  // already has an account. We don't create a duplicate or count a join, but we
  // DO fill in any missing name (never overwriting existing data) and email them
  // a magic login link so they can get in.
  const davAccount = createCardDAVAccount(config)
  const davMatch = await findUserByEmail(davAccount, normalizedEmail)
  const sidecarRow = (
    await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1)
  )[0]

  if (davMatch || sidecarRow) {
    let uid: string
    let displayName: string | null
    let role: 'user' | 'admin'

    if (davMatch) {
      // Fill missing UID/name on the DAV VCard (source of truth) and persist
      // only if something actually changed.
      const mutated = fillMissingRegistrantData(davMatch.vcard, {
        uid: randomUUID(),
        firstName,
        lastName,
      })
      if (mutated) await saveUser(davAccount, davMatch.user, davMatch.vcard)
      const snap = extractUserFromVCardData(davMatch.vcard.toString())
      uid = snap?.uid ?? sidecarRow?.uid ?? randomUUID()
      displayName = snap?.displayName ?? sidecarRow?.displayName ?? null
      role = snap?.role ?? sidecarRow?.role ?? 'user'
    } else {
      uid = sidecarRow!.uid
      displayName = sidecarRow!.displayName ?? `${firstName} ${lastName}`.trim()
      role = sidecarRow!.role
    }

    // Mirror into the sidecar (insert if missing, reactivate + fill name).
    // role is left untouched on UPDATE — it is MariaDB-authoritative.
    await db
      .insert(users)
      .values({ uid, email: normalizedEmail, displayName, role })
      .onDuplicateKeyUpdate({ set: { displayName, deletedAt: null } })
    clearEmailNotFound(normalizedEmail)

    await sendLoginLink(config, { uid, email: normalizedEmail, displayName }, undefined)
    return { status: 'created' as const }
  }

  // 3. Write the contact to DAV (source of truth), then mirror into the sidecar
  // so login works immediately without waiting for the daily sync.
  const uid = randomUUID()
  const displayName = `${firstName} ${lastName}`.trim()
  await createUser(
    davAccount,
    buildRegistrantVCard({ uid, firstName, lastName, email: normalizedEmail }),
  )
  await db
    .insert(users)
    .values({ uid, email: normalizedEmail, displayName, role: 'user' })
    .onDuplicateKeyUpdate({ set: { email: normalizedEmail, displayName, deletedAt: null } })
  // A login attempt before this account existed may have negative-cached the
  // address; clear it so the verification link works immediately.
  clearEmailNotFound(normalizedEmail)

  // 4. Record the join (the "who + when" audit trail; count = COUNT(*)).
  await db.insert(registrationLinkRedemptions).values({ linkToken: token, userUid: uid })

  // 5. Verify email ownership by sending the magic login link — clicking it
  // both confirms the address and logs the new user in.
  await sendLoginLink(config, { uid, email: normalizedEmail, displayName }, undefined)

  return { status: 'created' as const }
})
