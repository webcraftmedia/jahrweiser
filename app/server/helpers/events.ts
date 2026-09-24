import { and, isNotNull, lt } from 'drizzle-orm'

import { useDb } from '../db'
import { userEvents } from '../db/schema'

/**
 * The member-facing audit trail: what to write into it, and when to throw it
 * away again.
 *
 * See `server/db/schema/user-events.ts` for the table and why it exists.
 */

/**
 * Every event the app records. Adding one is a line here — the column is a
 * varchar precisely so that a new kind of event never needs a migration.
 *
 * Grouped by prefix so the admin UI can filter on it (`auth.`, `session.`, …)
 * without a second column to keep in sync.
 */
export const USER_EVENT_TYPES = [
  // A login link: asked for, held back by the cooldown, asked for by somebody
  // we do not know, refused because the account is blocked or gone, sent, not
  // sent.
  'auth.link_requested',
  'auth.link_cooldown',
  'auth.link_unknown',
  'auth.link_refused',
  'auth.mail_sent',
  'auth.mail_failed',
  // Redeeming one. The four refusals are the reasons in `RedeemFailure`.
  'auth.redeem_ok',
  'auth.redeem_used',
  'auth.redeem_expired',
  'auth.redeem_unknown',
  'auth.redeem_disabled',
  // Sessions. `invalidated` carries whether it was revoked or simply old.
  // There is no `session.created`: a session is only ever born from a redeemed
  // link, and `auth.redeem_ok` already says so.
  'session.invalidated',
  // Joining through an invitation link.
  'register.redeemed',
  // Newsletter: delivered, and the two ways of changing one's mind about it.
  'newsletter.sent',
  'newsletter.subscribed',
  'newsletter.unsubscribed',
  // A member editing their own profile (name, postal code).
  'profile.updated',
  // An admin changing which calendars a member may see.
  'admin.tags_changed',
  // An admin resolving a masked row back to a person. `email_lookup` is a
  // search for an address somebody already knew; `email_revealed` is the
  // deliberate uncovering of one they did not. Both are recorded against the
  // member, so the chronicle shows who looked — that is the whole point of
  // allowing it at all.
  'admin.email_lookup',
  'admin.email_revealed',
  // An admin intervening in an account.
  'admin.blocked',
  'admin.unblocked',
  'admin.sessions_revoked',
  'admin.login_link_sent',
] as const

export type UserEventType = (typeof USER_EVENT_TYPES)[number]

/** How long the trail is kept at all. */
export const EVENT_RETENTION_DAYS = 180
/** How long the truncated origin survives inside it. */
export const IP_RETENTION_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The two cut-offs the retention sweep works against. Split out because mixing
 * them up is the one mistake here with teeth: sweeping events at the IP horizon
 * would silently shorten the whole trail to a month.
 */
export function retentionCutoffs(now: number): { anonymiseBefore: Date; deleteBefore: Date } {
  return {
    anonymiseBefore: new Date(now - IP_RETENTION_DAYS * DAY_MS),
    deleteBefore: new Date(now - EVENT_RETENTION_DAYS * DAY_MS),
  }
}

/**
 * The request, typed without importing h3 — it is not a direct dependency of
 * this app, and the auto-import already gives us the shape.
 */
type RequestEvent = Parameters<typeof getRequestIP>[0]

export interface UserEventInput {
  type: UserEventType
  /** Who it is about. Omit where the attempt cannot be attributed. */
  userUid?: string | null
  /** The admin who caused it, where it was not the member themselves. */
  actorUid?: string | null
  meta?: Record<string, unknown>
  /** Only ever read for its truncated origin. */
  event?: RequestEvent
}

/**
 * Narrow an address down to the network it came from: IPv4 to /24, IPv6 to /48.
 *
 * Enough to recognise that a burst of refused attempts shares an origin, not
 * enough to identify a connection — which is the whole point, because the
 * alternative in a members' area is keeping a movement profile of people whose
 * only offence was logging in.
 *
 * Anything that does not parse becomes null rather than a guess: a half-read
 * address in an audit trail invites conclusions it cannot support.
 */
export function truncateIp(ip: string | null | undefined): string | null {
  const raw = (ip ?? '').trim()
  if (!raw) return null

  // IPv4-mapped IPv6 (`::ffff:192.0.2.1`) is an IPv4 address wearing a hat —
  // which is what a dual-stack Node reports for an IPv4 client. Only unwrapped
  // when what follows is dotted: `::ffff:1234:5678` is a genuine IPv6 address
  // and must keep its IPv6 reading.
  const V4_MAPPED = '::ffff:'
  const unwrapped = raw.slice(V4_MAPPED.length)
  const candidate =
    raw.toLowerCase().startsWith(V4_MAPPED) && unwrapped.includes('.') ? unwrapped : raw

  if (candidate.includes(':')) {
    // Keep at most the first three groups, stopping at a `::` — `2001:db8::1`
    // has no third group, and inventing one would name a network that is not
    // the one we saw.
    const kept: string[] = []
    for (const group of candidate.split(':')) {
      if (kept.length === 3 || group === '') break
      kept.push(group)
    }
    return `${kept.join(':')}::`
  }

  const parts = candidate.split('.')
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) {
    return null
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`
}

/**
 * Write one line of the trail.
 *
 * Fails open, loudly: a member must never be unable to log in because the
 * audit table was busy. The console line that replaces the lost row is the
 * operator's cue that the trail has a hole in it — silently swallowing it
 * would make the log look complete when it is not.
 */
export async function recordEvent(input: UserEventInput): Promise<void> {
  try {
    await useDb()
      .insert(userEvents)
      .values({
        at: new Date(),
        type: input.type,
        userUid: input.userUid ?? null,
        actorUid: input.actorUid ?? null,
        meta: input.meta ?? null,
        ipPrefix: input.event
          ? truncateIp(getRequestIP(input.event, { xForwardedFor: true }))
          : null,
      })
    // eslint-disable-next-line no-catch-all/no-catch-all -- Audit-Schreibfehler darf keinen Login verhindern; er wird laut geloggt
  } catch (error) {
    console.error(`[events] failed to record ${input.type}:`, error)
  }
}

/**
 * Forget, on schedule.
 *
 * Two horizons rather than one: the origin is the sharpest thing in the table
 * and the first to go, while the bare fact that a link was sent stays long
 * enough to answer "was I ever sent anything in March?". Runs alongside the
 * sync cron — see `server/api/admin/sync-now.post.ts`.
 */
export async function pruneUserEvents(now: number = Date.now()): Promise<{
  deleted: number
  anonymised: number
}> {
  const db = useDb()
  const { anonymiseBefore, deleteBefore } = retentionCutoffs(now)

  const anonymised = await db
    .update(userEvents)
    .set({ ipPrefix: null })
    .where(and(lt(userEvents.at, anonymiseBefore), isNotNull(userEvents.ipPrefix)))

  const deleted = await db.delete(userEvents).where(lt(userEvents.at, deleteBefore))

  return { anonymised: anonymised[0].affectedRows, deleted: deleted[0].affectedRows }
}
