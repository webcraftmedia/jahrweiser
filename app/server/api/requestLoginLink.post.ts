import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { useDb } from '../db'
import { loginTokens, userTags, users } from '../db/schema'
import { createCardDAVAccount, findUserByEmail } from '../helpers/dav'
import { recordEvent } from '../helpers/events'
import { isWithinLoginCooldown, markLoginRequested } from '../helpers/loginCooldown'
import { sendLoginLink } from '../helpers/loginLink'
import { isEmailNotFound, markEmailNotFound } from '../helpers/negativeCache'
import { extractUserFromVCardData } from '../helpers/sync'

const bodySchema = z.object({
  email: z.email(),
  redirect: z.string().startsWith('/').optional(),
})

/** The sidecar's id for an address, or null — used only to attribute events. */
async function uidFor(email: string): Promise<string | null> {
  const row = (
    await useDb().select({ uid: users.uid }).from(users).where(eq(users.email, email)).limit(1)
  )[0]
  return row?.uid ?? null
}

export default defineEventHandler(async (event) => {
  const { email, redirect } = await readValidatedBody(event, bodySchema.parse)
  const config = useRuntimeConfig()
  const db = useDb()
  const normalizedEmail = email.toLowerCase()

  // Checked before anything that depends on the address existing, and fed for
  // every address alike — see loginCooldown.ts. `cooldown: true` is the one
  // answer this endpoint gives that is not "we may or may not have sent
  // something": the caller demonstrably asked a moment ago, so telling them to
  // look at the mail they already have leaks nothing and stops the loop of
  // re-requesting, getting no mail, and clicking an older link that has since
  // expired.
  if (
    config.LOGIN_RATE_LIMIT_MS > 0 &&
    isWithinLoginCooldown(normalizedEmail, config.LOGIN_RATE_LIMIT_MS)
  ) {
    // Attributed with a plain sidecar lookup — no DAV fallback, which stays
    // behind the cooldown gate where it belongs. Worth the one indexed query:
    // "asked five times in a row" is precisely the pattern somebody reports as
    // "I never get a mail", and it is invisible without this line.
    await recordEvent({ type: 'auth.link_cooldown', userUid: await uidFor(normalizedEmail), event })
    return { cooldown: true }
  }
  markLoginRequested(normalizedEmail)

  if (isEmailNotFound(normalizedEmail)) {
    await recordEvent({ type: 'auth.link_unknown', event })
    return {}
  }

  let userRow = (await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1))[0]

  // Lazy-fallback: ask DAV directly if not in sidecar yet
  if (!userRow) {
    const davAccount = createCardDAVAccount(config)
    const davMatch = await findUserByEmail(davAccount, normalizedEmail)
    if (!davMatch) {
      markEmailNotFound(normalizedEmail)
      // No address on the row, by design: see the comment on `user_uid` in
      // server/db/schema/user-events.ts. What stays is the bare fact that
      // somebody tried, and the network they tried from.
      await recordEvent({ type: 'auth.link_unknown', event })
      return {}
    }
    const snap = extractUserFromVCardData(davMatch.vcard.toString())
    if (snap?.email !== normalizedEmail) {
      markEmailNotFound(normalizedEmail)
      await recordEvent({ type: 'auth.link_unknown', event })
      return {}
    }
    await db
      .insert(users)
      .values({
        uid: snap.uid,
        email: snap.email,
        displayName: snap.displayName,
        role: snap.role,
      })
      .onDuplicateKeyUpdate({
        set: {
          email: snap.email,
          displayName: snap.displayName,
          role: snap.role,
          deletedAt: null,
        },
      })
    if (snap.tags.length > 0) {
      await db
        .insert(userTags)
        .values(snap.tags.map((tag) => ({ userUid: snap.uid, tag })))
        .onDuplicateKeyUpdate({ set: { tag: snap.tags[0]! } })
    }
    userRow = (await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1))[0]
  }

  if (userRow?.deletedAt !== null || userRow.loginDisabled) {
    // A blocked account asking for a link is worth seeing — from the member's
    // side it looks exactly like a mail that never arrived, and they will say
    // so rather than "I am locked out".
    await recordEvent({
      type: 'auth.link_refused',
      userUid: userRow?.uid ?? null,
      meta: { reason: userRow?.deletedAt != null ? 'deleted' : 'disabled' },
      event,
    })
    return {}
  }

  const recentToken = (
    await db
      .select({ requestedAt: loginTokens.requestedAt })
      .from(loginTokens)
      .where(eq(loginTokens.userUid, userRow.uid))
      .orderBy(desc(loginTokens.requestedAt))
      .limit(1)
  )[0]

  // The durable half of the same gate: the map above is per-process, this
  // survives a restart. Reachable only when the map has no entry, i.e. for the
  // first request after a restart, so it does not widen what the response says
  // about who exists.
  if (
    config.LOGIN_RATE_LIMIT_MS > 0 &&
    recentToken &&
    Date.now() - recentToken.requestedAt.getTime() < config.LOGIN_RATE_LIMIT_MS
  ) {
    await recordEvent({ type: 'auth.link_cooldown', userUid: userRow.uid, event })
    return { cooldown: true }
  }

  await recordEvent({ type: 'auth.link_requested', userUid: userRow.uid, event })
  await sendLoginLink(config, userRow, redirect)

  return {}
})
