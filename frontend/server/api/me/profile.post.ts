import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../../db'
import { users } from '../../db/schema'
import { setPostalCode, setVCardName } from '../../helpers/contactName'
import { createCardDAVAccount, findUserByEmail, saveUser } from '../../helpers/dav'
import { loadPlzAreas, lookupPostalCode, normalisePostalCode } from '../../helpers/memberMap'
import { ABSOLUTE_TTL_SECONDS } from '../../helpers/sessionTtl'

const bodySchema = z.object({
  // Both may be empty: saving a blank name clears the stored display name.
  firstName: z.string().trim().max(100),
  lastName: z.string().trim().max(100),
  // Postal code is optional; empty clears it. The bound is lenient because what
  // arrives is what somebody typed — the shape is judged below, against the
  // map's geometry rather than against a regex.
  postalCode: z.string().trim().max(16),
})

/**
 * The five digits to store, or null to clear — refusing anything the map cannot
 * place.
 *
 * Validating against the geometry rather than against `/^\d{5}$/` is the whole
 * point: five digits that are not a German postal code (a transposed pair, a
 * house number) pass every format check and then put the member nowhere. The
 * map is the only thing in the app that consumes this field, so the map's own
 * data is the right authority for it.
 *
 * Without the artefact there is nothing to validate against and the check falls
 * back to the format. A deployment that has never run `npm run map:build` has
 * no map (see docu/karte.md) — it must not also have an unusable profile form.
 */
function postalCodeToStore(postalCode: string, geometry: Awaited<ReturnType<typeof loadPlzAreas>>) {
  if (!postalCode) return null
  const plz = geometry
    ? lookupPostalCode(postalCode, geometry)?.plz
    : normalisePostalCode(postalCode)
  if (!plz) {
    throw createError({ statusCode: 400, statusMessage: 'invalid-postal-code' })
  }
  return plz
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const uid = session.user.uid
  if (!uid) {
    throw createError({ statusCode: 401, statusMessage: 'No user context' })
  }
  const body = await readValidatedBody(event, bodySchema.parse)
  const { firstName, lastName } = body
  // Refused before DAV is touched: a rejected save must leave nothing half
  // written. What goes on is the normalised code, so "D-64673" and "64 673"
  // cannot come back as two different members' worth of postal code.
  const stored = postalCodeToStore(body.postalCode, await loadPlzAreas())
  const postalCode = stored ?? ''
  const config = useRuntimeConfig()
  const db = useDb()

  // Write the name to DAV (source of truth for contact data).
  const account = createCardDAVAccount(config)
  const match = await findUserByEmail(account, session.user.email)
  if (!match) {
    throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
  }
  setVCardName(match.vcard, firstName, lastName)
  setPostalCode(match.vcard, postalCode)
  // Legacy contacts may lack a UID — make sure the sidecar key is present.
  if (!match.vcard.getFirstPropertyValue('uid')?.toString().trim()) {
    match.vcard.updatePropertyWithValue('uid', uid)
  }
  await saveUser(account, match.user, match.vcard)

  // Mirror the display name and the postal code into the sidecar so they are
  // consistent without waiting for the daily sync — the member map aggregates
  // over the sidecar copy, so a fresh postal code has to show up right away.
  const displayName = `${firstName} ${lastName}`.trim()
  await db.update(users).set({ displayName, postalCode: stored }).where(eq(users.uid, uid))

  // Refresh the session so the header reflects the new name immediately. defu
  // merges, so uid/email/role are preserved; h3 keeps the session id, leaving
  // the DB-backed session row valid.
  await setUserSession(event, { user: { name: displayName } }, { maxAge: ABSOLUTE_TTL_SECONDS })

  return { firstName, lastName, postalCode, displayName }
})
