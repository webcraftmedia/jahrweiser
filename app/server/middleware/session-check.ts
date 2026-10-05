import { eq } from 'drizzle-orm'

import { SESSION_EXPIRES_HEADER } from '../../shared/session'
import { useDb } from '../db'
import { sessions } from '../db/schema'
import { withDbTimeout } from '../helpers/dbTimeout'
import { recordEvent } from '../helpers/events'
import { nextExpiry } from '../helpers/sessionTtl'

const LAST_SEEN_THROTTLE_MS = 60_000

/**
 * Why a cookie stopped being worth anything. Three different stories for the
 * member: somebody ended the session, it simply aged out, or the row is gone
 * entirely — which is what a restored database backup looks like from here.
 */
function invalidationReason(row: { revokedAt: Date | null } | undefined): string {
  if (!row) return 'missing'
  return row.revokedAt !== null ? 'revoked' : 'expired'
}

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  // nuxt-auth-utils stores the session id under top-level `id`; we reuse it
  // as the PK of our sessions table (set in redeemLoginLink). The middleware
  // only acts on authenticated requests — anonymous sessions still have an id
  // but no `user`, and we leave those alone.
  const sessionId = (session as { id?: string }).id
  if (!sessionId || !(session as { user?: unknown }).user) return

  const db = useDb()
  // This runs on every authenticated request, so a query that hangs here hangs
  // the whole app for everyone logged in — the deadline matters more here than
  // anywhere else.
  const row = (
    await withDbTimeout(db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))
  )[0]

  const now = Date.now()
  const isInvalid = row?.revokedAt !== null || row.expiresAt.getTime() < now

  if (isInvalid) {
    // Recorded before the cookie goes: once it is cleared the browser stops
    // sending it, so this is the only request that can say why somebody was
    // suddenly logged out. Which of the two reasons it was matters — revoked
    // is somebody's decision, expired is just time passing.
    await recordEvent({
      type: 'session.invalidated',
      userUid: (session as { user?: { uid?: string } }).user?.uid,
      meta: { reason: invalidationReason(row) },
      event,
    })
    // Clear the cookie so subsequent requests are clean, AND throw 401 for
    // this request — clearUserSession alone doesn't propagate within the
    // same request to downstream `requireUserSession` calls.
    await clearUserSession(event)
    if (event.path.startsWith('/api/')) {
      throw createError({ statusCode: 401, statusMessage: 'Session invalid' })
    }
    return
  }

  let expiresAt = row.expiresAt.getTime()
  const lastSeen = row.lastSeenAt?.getTime() ?? 0
  if (now - lastSeen > LAST_SEEN_THROTTLE_MS) {
    // Sliding session: push the idle window forward on activity, capped at the
    // absolute maximum from creation. Throttled to once per minute alongside
    // lastSeenAt, so this stays cheap.
    expiresAt = nextExpiry(now, row.createdAt.getTime())
    await withDbTimeout(
      db
        .update(sessions)
        .set({ lastSeenAt: new Date(now), expiresAt: new Date(expiresAt) })
        .where(eq(sessions.id, sessionId)),
    )
  }

  // How long this session still holds, for the installed app: offline it
  // shows the calendar it keeps on the device only as long as the server
  // would still let it in (docu/pwa.md). The cookie cannot tell — it is
  // httpOnly, sealed, and lives for the absolute cap regardless. A duration
  // rather than a date, so a phone whose clock is off still counts right.
  setHeader(event, SESSION_EXPIRES_HEADER, String(Math.floor((expiresAt - now) / 1000)))
})
